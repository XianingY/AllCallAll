package presence

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/allcallall/backend/internal/user"
)

const (
	presenceKeyPrefix = "presence:user:"
	defaultTTL        = 24 * time.Hour
)

// Status 表示用户在线状态
// Status represents a user's presence information.
type Status struct {
	Email    string    `json:"email"`
	Online   bool      `json:"online"`
	LastSeen time.Time `json:"last_seen"`
}

// Manager 管理用户在线状态
// Manager handles presence updates backed by Redis.
type Manager struct {
	redis     *redis.Client
	logger    zerolog.Logger
	userSvc   *user.Service
	statusTTL time.Duration
}

// NewManager 创建 presence 管理器
// NewManager returns a presence manager.
func NewManager(rdb *redis.Client, log zerolog.Logger, userSvc *user.Service) *Manager {
	return &Manager{
		redis:     rdb,
		logger:    log.With().Str("component", "presence_manager").Logger(),
		userSvc:   userSvc,
		statusTTL: defaultTTL,
	}
}

// SetOnline 标记用户在线
// SetOnline updates Redis presence entry to online.
func (m *Manager) SetOnline(ctx context.Context, email string) error {
	status := Status{
		Email:    email,
		Online:   true,
		LastSeen: time.Now(),
	}
	return m.saveStatus(ctx, status)
}

// SetOffline 标记用户离线，并同步 last_seen
// SetOffline marks the user as offline and updates DB last seen timestamp.
func (m *Manager) SetOffline(ctx context.Context, email string) error {
	now := time.Now()
	status := Status{
		Email:    email,
		Online:   false,
		LastSeen: now,
	}

	if err := m.saveStatus(ctx, status); err != nil {
		return err
	}

	userModel, err := m.userSvc.GetByEmail(ctx, email)
	if err != nil {
		m.logger.Warn().Err(err).Str("email", email).Msg("failed to fetch user for last seen")
		return nil
	}

	if err := m.userSvc.UpdateLastSeen(ctx, userModel.ID, &now); err != nil {
		m.logger.Warn().Err(err).Uint64("user_id", userModel.ID).Msg("failed to update last seen in DB")
	}
	return nil
}

// UpdateLastSeen 仅更新 last_seen，不改变在线状态
// UpdateLastSeen refreshes the timestamp while keeping status.
func (m *Manager) UpdateLastSeen(ctx context.Context, email string) error {
	status, err := m.GetStatus(ctx, email)
	if err != nil {
		return err
	}
	if status.Email == "" {
		status.Email = email
	}
	status.LastSeen = time.Now()
	return m.saveStatus(ctx, status)
}

// GetStatus 获取单个用户状态
// GetStatus fetches presence for a single email.
func (m *Manager) GetStatus(ctx context.Context, email string) (Status, error) {
	val, err := m.redis.Get(ctx, m.key(email)).Result()
	if err != nil {
		if err == redis.Nil {
			return Status{
				Email:    email,
				Online:   false,
				LastSeen: time.Time{},
			}, nil
		}
		return Status{}, err
	}
	var status Status
	if err := json.Unmarshal([]byte(val), &status); err != nil {
		return Status{}, err
	}
	return status, nil
}

// GetStatuses 批量获取用户状态
// GetStatuses fetches presence for multiple emails.
func (m *Manager) GetStatuses(ctx context.Context, emails []string) (map[string]Status, error) {
	result := make(map[string]Status, len(emails))
	if len(emails) == 0 {
		return result, nil
	}

	keys := make([]string, 0, len(emails))
	for _, email := range emails {
		keys = append(keys, m.key(email))
	}

	values, err := m.redis.MGet(ctx, keys...).Result()
	if err != nil && err != redis.Nil {
		return nil, err
	}

	for i, raw := range values {
		email := emails[i]
		if raw == nil {
			result[email] = Status{
				Email:    email,
				Online:   false,
				LastSeen: time.Time{},
			}
			continue
		}
		var status Status
		if err := json.Unmarshal([]byte(raw.(string)), &status); err != nil {
			result[email] = Status{
				Email:    email,
				Online:   false,
				LastSeen: time.Time{},
			}
			continue
		}
		result[email] = status
	}
	return result, nil
}

func (m *Manager) saveStatus(ctx context.Context, status Status) error {
	data, err := json.Marshal(status)
	if err != nil {
		return err
	}
	return m.redis.Set(ctx, m.key(status.Email), data, m.statusTTL).Err()
}

func (m *Manager) key(email string) string {
	return presenceKeyPrefix + email
}
