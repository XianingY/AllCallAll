package database

import (
	"fmt"
	"time"

	"github.com/rs/zerolog"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"

	appcfg "github.com/allcallall/backend/internal/config"
)

// NewMySQL 建立新的 MySQL 数据库连接
// NewMySQL creates a GORM DB backed by MySQL with sane defaults.
func NewMySQL(cfg appcfg.DatabaseConfig, log zerolog.Logger) (*gorm.DB, error) {
	gormLogger := logger.New(
		logWriter{logger: log.With().Str("component", "gorm").Logger()},
		logger.Config{
			SlowThreshold:             200 * time.Millisecond,
			LogLevel:                  logger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  false,
		},
	)

	db, err := gorm.Open(mysql.Open(cfg.DSN), &gorm.Config{
		Logger: gormLogger,
		NamingStrategy: schema.NamingStrategy{
			SingularTable: true,
		},
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	if cfg.MaxOpenConns > 0 {
		sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	}
	if cfg.MaxIdleConns > 0 {
		sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	}
	if cfg.ConnMaxLifetimeMins > 0 {
		sqlDB.SetConnMaxLifetime(time.Duration(cfg.ConnMaxLifetimeMins) * time.Minute)
	}

	return db, nil
}

type logWriter struct {
	logger zerolog.Logger
}

// Printf 实现 gorm logger.Writer 接口
// Printf implements gorm logger.Writer.
func (w logWriter) Printf(msg string, data ...interface{}) {
	w.logger.Warn().Msg(fmt.Sprintf(msg, data...))
}
