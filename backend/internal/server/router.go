package server

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
)

// NewEngine 创建并返回 Gin 引擎
// NewEngine returns a Gin engine with baseline middleware.
func NewEngine(log zerolog.Logger) *gin.Engine {
	engine := gin.New()
	engine.Use(gin.Recovery())
	engine.Use(requestLogger(log.With().Str("component", "http").Logger()))

	return engine
}

func requestLogger(log zerolog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		c.Next()

		duration := time.Since(start)
		log.Info().
			Str("method", c.Request.Method).
			Str("path", path).
			Int("status", c.Writer.Status()).
			Str("client_ip", c.ClientIP()).
			Dur("duration", duration).
			Msg("http_request_completed")
	}
}
