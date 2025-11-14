package logger

import (
	"os"
	"strings"
	"time"

	"github.com/rs/zerolog"
)

// New 创建新的 Zerolog 日志记录器
// New returns a zerolog.Logger configured with given level.
func New(level string) zerolog.Logger {
	lvl, err := zerolog.ParseLevel(strings.ToLower(level))
	if err != nil {
		lvl = zerolog.InfoLevel
	}

	output := zerolog.ConsoleWriter{
		Out:        os.Stdout,
		TimeFormat: time.RFC3339,
	}

	logger := zerolog.New(output).With().Timestamp().Logger().Level(lvl)
	return logger
}
