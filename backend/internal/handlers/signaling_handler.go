package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog"

	"github.com/allcall/backend/internal/auth"
	"github.com/allcall/backend/internal/signaling"
)

// SignalingHandler 信令处理器
// SignalingHandler upgrades HTTP requests to WebSocket for signaling.
type SignalingHandler struct {
	logger   zerolog.Logger
	hub      *signaling.Hub
	upgrader websocket.Upgrader
}

// NewSignalingHandler 构造函数
// NewSignalingHandler creates a SignalingHandler.
func NewSignalingHandler(log zerolog.Logger, hub *signaling.Hub) *SignalingHandler {
	return &SignalingHandler{
		logger: log.With().Str("component", "signaling_handler").Logger(),
		hub:    hub,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

// Handle 升级 WebSocket
// Handle upgrades request to WebSocket and delegates to hub.
func (h *SignalingHandler) Handle(c *gin.Context) {
	claims, err := auth.GetClaimsFromContext(c)
	if err != nil {
		JSONError(c, http.StatusUnauthorized, "unauthorized")
		return
	}

	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		h.logger.Error().Err(err).Msg("failed to upgrade websocket")
		return
	}

	h.hub.HandleConnection(c.Request.Context(), claims.Email, conn)
}
