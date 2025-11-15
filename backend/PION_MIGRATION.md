# Pion WebRTC 迁移指南

## 概述

本项目已从基础的 WebRTC 实现迁移到 **Pion 框架**。Pion 是一个强大的纯 Go WebRTC 库，提供了更好的可扩展性和性能。

## 变更内容

### 1. 新增包和模块

#### `internal/media/` 包
- **types.go**: 定义了 Pion 相关的数据结构
  - `PeerConnection`: 包装的对等连接结构
  - `MediaHandlers`: 媒体事件处理程序
  - `CallState`: 通话状态枚举

- **engine.go**: 核心媒体引擎
  - `Engine`: 管理所有 Pion PeerConnection 实例
  - 提供创建、管理和销毁连接的方法
  - 自动处理连接生命周期事件

#### `internal/signaling/` 包的新文件
- **pion_handler.go**: Pion 消息处理程序
  - `PionSignalMessage`: 扩展的信令消息格式
  - `HandlePionMessage()`: 处理 Pion 相关消息
  - `CreateOffer()`, `handleAnswer()` 等方法

- **pion_init.go**: Pion 初始化代码
  - `InitPionMediaEngine()`: 初始化媒体引擎

- **adapter.go**: 兼容层
  - `SignalAdapter`: 适配现有客户端到 Pion 操作
  - 确保现有客户端无需修改即可工作

### 2. 修改的文件

#### `go.mod`
- 添加了 Pion WebRTC 依赖: `github.com/pion/webrtc/v4`

#### `internal/signaling/hub.go`
- 添加 `mediaEngine` 字段到 `Hub` 结构体
- 新增 `WithMediaEngine()` 方法用于关联媒体引擎

#### `cmd/server/main.go`
- 初始化 Pion 媒体引擎
- 将媒体引擎连接到信令枢纽
- 添加媒体引擎的优雅关闭处理

## 架构设计

### 分层架构

```
┌─────────────────────────────────────┐
│  移动客户端 (React Native)          │
└──────────────┬──────────────────────┘
               │
               ├─ WebSocket 信令通道
               │
┌──────────────▼──────────────────────┐
│  信令处理层 (Signaling Handler)      │
├──────────────────────────────────────┤
│ - 处理 WebSocket 连接               │
│ - 验证和路由消息                    │
│ - 使用 SignalAdapter 适配消息      │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  适配层 (SignalAdapter)             │
├──────────────────────────────────────┤
│ - 转换客户端消息到 Pion 操作        │
│ - 保持向后兼容性                    │
│ - 映射 call lifecycle 事件          │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  媒体引擎层 (Media Engine)          │
├──────────────────────────────────────┤
│ - 管理 PeerConnection 实例          │
│ - 处理媒体轨道和编解码器           │
│ - 管理 ICE 候选和连接状态          │
└──────────────┬──────────────────────┘
               │
        ┌──────▴──────┐
        │             │
    ┌───▼────┐   ┌───▼────┐
    │ Audio  │   │ Video  │
    │ Tracks │   │ Tracks │
    └────────┘   └────────┘
```

## 支持的操作

### 1. 创建对等连接
```go
engine.CreatePeerConnection(ctx, callID, localEmail, remoteEmail, &webrtc.Configuration{})
```

### 2. 处理 WebRTC Offer
```
客户端发送 call.invite → 
SignalAdapter.handleCallInvite() → 
Hub.HandlePionMessage() → 
hub.handleOffer() → 
PeerConnection.SetRemoteDescription()
```

### 3. 处理 WebRTC Answer
```
客户端接收 call.accept → 
Pion 创建 Answer SDP →
发送给远程对等方
```

### 4. 处理 ICE 候选
```
客户端发送 ice.candidate →
SignalAdapter.handleIceCandidate() →
Hub.HandlePionMessage() →
PeerConnection.AddICECandidate()
```

### 5. 处理媒体轨道
```
远程对等方发送媒体轨道 →
PeerConnection.OnTrack() 触发 →
MediaHandlers.OnAudioTrack/OnVideoTrack() 调用
```

### 6. 关闭连接
```
客户端发送 call.end →
SignalAdapter.handleCallEnd() →
Engine.ClosePeerConnection() →
PeerConnection.Close()
```

## 向后兼容性

现有的客户端无需修改即可与新的 Pion 实现一起工作。`SignalAdapter` 负责将客户端消息适配到 Pion 操作：

- **call.invite** → 准备连接，等待 offer
- **ice.candidate** → 添加到 Pion PeerConnection
- **call.accept** → 标记连接已接受
- **call.end** → 关闭 Pion PeerConnection

## 可扩展功能路线

### 短期（即时可用）
- [x] 基础音视频通话
- [x] ICE 候选处理
- [x] 连接状态管理
- [ ] 基础统计信息收集

### 中期（3-6 个月）
- [ ] 数据通道支持 (DataChannel)
- [ ] 高级统计和诊断
- [ ] 自适应比特率控制
- [ ] 多轨道管理

### 长期（6-12 个月）
- [ ] 屏幕共享功能
- [ ] 录制和回放
- [ ] 高级音视频处理
- [ ] 多方会议支持

## 配置选项

### ICE 服务器配置
在 `internal/signaling/pion_init.go` 中配置：
```go
cfg := &media.Config{
    WebRTCConfig: webrtc.Configuration{
        ICEServers: []webrtc.ICEServer{
            {
                URLs: []string{"stun:stun.l.google.com:19302"},
            },
        },
    },
}
```

## 监控和调试

### 列出活跃连接
```go
connections := mediaEngine.ListPeerConnections()
for _, pc := range connections {
    fmt.Printf("Call: %s, State: %v\n", pc.CallID, pc.State)
}
```

### 获取连接统计
```go
stats, err := hub.GetConnectionStats(callID, localEmail, remoteEmail)
```

### 日志记录
所有媒体引擎操作都通过 `zerolog` 记录，可在应用日志中跟踪。

## 性能考虑

1. **连接生命周期**: 自动清理已关闭的连接以防止内存泄漏
2. **并发性**: 使用 `sync.RWMutex` 保护对等连接映射
3. **资源管理**: 媒体引擎提供优雅的关闭机制

## 故障排查

### 连接失败
1. 检查 ICE 服务器配置
2. 验证防火墙规则允许 WebRTC 流量
3. 查看详细日志中的 ICE 连接状态

### 媒体质量问题
1. 监控 RTP 统计数据
2. 检查网络延迟和丢包率
3. 调整编解码器优选项

### 内存泄漏
1. 确保所有连接都正确关闭
2. 监控活跃连接数量
3. 检查媒体轨道是否正确释放

## 相关资源

- [Pion WebRTC 文档](https://github.com/pion/webrtc)
- [WebRTC 规范](https://w3c.github.io/webrtc-pc/)
- [Go WebRTC 最佳实践](https://github.com/pion/webrtc/wiki)

## 迁移时间线

- **版本 0.0.2**: Pion 框架集成完成
- **版本 0.0.3**: 计划 - 数据通道支持
- **版本 0.0.4**: 计划 - 高级统计收集
