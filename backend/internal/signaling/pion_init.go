package signaling

import (
	"github.com/pion/webrtc/v4"
	"github.com/rs/zerolog"

	"github.com/allcallall/backend/internal/media"
)

// InitPionMediaEngine 初始化 Pion 媒体引擎
// InitPionMediaEngine initializes the Pion WebRTC media engine
func InitPionMediaEngine(logger zerolog.Logger) (*media.Engine, error) {
	// 创建媒体引擎
	// Create media engine
	cfg := &media.Config{
		WebRTCConfig: webrtc.Configuration{
			// 可以在这里配置 ICE 服务器
			// ICEServers can be configured here if needed
		},
	}

	engine, err := media.NewEngine(logger, cfg)
	if err != nil {
		return nil, err
	}

	logger.Info().Msg("pion media engine initialized")
	return engine, nil
}
