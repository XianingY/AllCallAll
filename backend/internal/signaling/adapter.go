package signaling

import (
	"encoding/json"
	"fmt"

	"github.com/rs/zerolog"
)

// SignalAdapter 适配现有的信令消息到 Pion 媒体操作
// SignalAdapter adapts existing signaling messages to Pion media operations
// 这个适配器确保向后兼容性，允许现有客户端无需改动就能工作
// This adapter ensures backward compatibility, allowing existing clients to work without changes
type SignalAdapter struct {
	logger zerolog.Logger
	hub    *Hub
}

// NewSignalAdapter 创建新的信令适配器
// NewSignalAdapter creates a new signaling adapter
func NewSignalAdapter(logger zerolog.Logger, hub *Hub) *SignalAdapter {
	return &SignalAdapter{
		logger: logger.With().Str("component", "signal_adapter").Logger(),
		hub:    hub,
	}
}

// ProcessSignalMessage 处理来自客户端的信令消息
// ProcessSignalMessage processes signaling messages from clients
// 支持现有的 WebRTC 格式并适配到 Pion 操作
// Supports existing WebRTC formats and adapts them to Pion operations
func (a *SignalAdapter) ProcessSignalMessage(message *SignalMessage) error {
	if a.hub.mediaEngine == nil {
		return fmt.Errorf("media engine not available")
	}

	a.logger.Debug().
		Str("type", message.Type).
		Str("call_id", message.CallID).
		Str("from", message.From).
		Str("to", message.To).
		Msg("processing signal message")

	// 根据消息类型适配
	// Adapt based on message type
	switch message.Type {
	case TypeCallInvite:
		return a.handleCallInvite(message)

	case TypeCallAccept:
		return a.handleCallAccept(message)

	case TypeCallReject:
		return a.handleCallReject(message)

	case TypeCallEnd:
		return a.handleCallEnd(message)

	case TypeIceCandidate:
		return a.handleIceCandidate(message)

	default:
		// 其他消息类型继续使用原有的处理逻辑
		// Other message types use original processing logic
		return nil
	}
}

// handleCallInvite 处理通话邀请
// handleCallInvite handles call invitations
// 为新的通话创建 Pion 对等连接
// Creates a Pion peer connection for the new call
func (a *SignalAdapter) handleCallInvite(message *SignalMessage) error {
	if message.CallID == "" {
		return fmt.Errorf("missing call_id in invite")
	}

	a.logger.Info().
		Str("call_id", message.CallID).
		Str("initiator", message.From).
		Str("recipient", message.To).
		Msg("call invite received, preparing media connection")

	// 不在这里创建对等连接
	// 而是等待 offer 到达时再创建
	// Don't create peer connection here
	// Wait for offer to arrive before creating

	return nil
}

// handleCallAccept 处理通话接受
// handleCallAccept handles call acceptance
func (a *SignalAdapter) handleCallAccept(message *SignalMessage) error {
	if message.CallID == "" {
		return fmt.Errorf("missing call_id in accept")
	}

	a.logger.Info().
		Str("call_id", message.CallID).
		Str("recipient", message.From).
		Str("initiator", message.To).
		Msg("call accept received")

	return nil
}

// handleCallReject 处理通话拒绝
// handleCallReject handles call rejection
func (a *SignalAdapter) handleCallReject(message *SignalMessage) error {
	if message.CallID == "" {
		return fmt.Errorf("missing call_id in reject")
	}

	a.logger.Info().
		Str("call_id", message.CallID).
		Str("recipient", message.From).
		Str("initiator", message.To).
		Msg("call reject received")

	// 清理对等连接（如果存在）
	// Clean up peer connection if it exists
	_ = a.hub.mediaEngine.ClosePeerConnection(message.CallID, message.From, message.To)

	return nil
}

// handleCallEnd 处理通话结束
// handleCallEnd handles call termination
func (a *SignalAdapter) handleCallEnd(message *SignalMessage) error {
	if message.CallID == "" {
		return fmt.Errorf("missing call_id in end")
	}

	a.logger.Info().
		Str("call_id", message.CallID).
		Msg("call end received")

	// 关闭对等连接
	// Close peer connection
	err := a.hub.mediaEngine.ClosePeerConnection(message.CallID, message.From, message.To)
	if err != nil {
		a.logger.Warn().Err(err).Str("call_id", message.CallID).Msg("error closing peer connection")
		// 继续处理，不返回错误
		// Continue processing, don't return error
	}

	return nil
}

// handleIceCandidate 处理 ICE 候选
// handleIceCandidate handles ICE candidates
// 从客户端接收的 ICE 候选被适配到 Pion 格式
// ICE candidates from client are adapted to Pion format
func (a *SignalAdapter) handleIceCandidate(message *SignalMessage) error {
	if message.CallID == "" {
		return fmt.Errorf("missing call_id in ice candidate")
	}

	// 解析 ICE 候选负载
	// Parse ICE candidate payload
	var candidate ICECandidatePayload
	if err := json.Unmarshal(message.Payload, &candidate); err != nil {
		return fmt.Errorf("unmarshal ice candidate: %w", err)
	}

	// 添加到对等连接
	// Add to peer connection
	return a.hub.HandlePionMessage(
		nil, // context 将由调用者提供
		message.CallID,
		message.From,
		message.To,
		"ice_candidate",
		message.Payload,
	)
}

// CreateOfferFromExistingMessage 从现有的通话邀请创建 offer
// CreateOfferFromExistingMessage creates an offer from an existing call invitation
// 这用于接收方创建答案前获取必要信息
// Used for responder to get necessary info before creating answer
func (a *SignalAdapter) CreateOfferFromExistingMessage(message *SignalMessage) (string, error) {
	return a.hub.CreateOffer(nil, message.CallID, message.To, message.From)
}
