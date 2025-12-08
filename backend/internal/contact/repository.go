package contact

import (
	"context"

	"gorm.io/gorm"

	"github.com/allcallall/backend/internal/models"
)

// Repository 联系人与关系数据访问
// Repository handles database operations for contacts.
type Repository struct {
	db *gorm.DB
}

// NewRepository 构造函数
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// AddContact 创建联系人关系
func (r *Repository) AddContact(ctx context.Context, ownerID, contactID uint64) error {
	contact := &models.Contact{
		OwnerID:   ownerID,
		ContactID: contactID,
	}
	return r.db.WithContext(ctx).Create(contact).Error
}

// RemoveContact 删除联系人关系
func (r *Repository) RemoveContact(ctx context.Context, ownerID, contactID uint64) error {
	return r.db.WithContext(ctx).
		Where("owner_id = ? AND contact_id = ?", ownerID, contactID).
		Delete(&models.Contact{}).Error
}

// ContactExists 检查联系人是否存在
func (r *Repository) ContactExists(ctx context.Context, ownerID, contactID uint64) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.Contact{}).
		Where("owner_id = ? AND contact_id = ?", ownerID, contactID).
		Count(&count).Error
	return count > 0, err
}

// ListContacts 列出联系人（返回用户信息）
func (r *Repository) ListContacts(ctx context.Context, ownerID uint64) ([]models.User, error) {
	var users []models.User
	err := r.db.WithContext(ctx).
		Table("contacts").
		Select("users.*").
		Joins("JOIN users ON contacts.contact_id = users.id").
		Where("contacts.owner_id = ?", ownerID).
		Order("users.display_name ASC").
		Find(&users).Error
	return users, err
}
