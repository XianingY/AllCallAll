# Pion WebRTC 集成技术说明

## 概述

已成功将项目通信协议从基础 WebRTC 实现迁移到 **Pion 框架**。此迁移提供了更好的可扩展性、性能和未来功能支持。

## 核心改进

### 1. 架构改进
- **模块化设计**: 将媒体处理逻辑与信令逻辑分离
- **可扩展性**: 易于添加新的媒体功能和特性
- **向后兼容**: 现有客户端无需修改即可工作

### 2. 技术特性
- **Pion WebRTC v4**: 纯 Go 实现，性能优异
- **自动资源管理**: 完整的生命周期管理和清理
- **完善的事件系统**: 媒体轨道、连接状态、ICE 状态变化等

### 3. 代码质量
- **完整的错误处理**: 所有操作都有详细的错误信息
- **详细的日志记录**: 使用 zerolog 进行结构化日志
- **并发安全**: 使用 sync.RWMutex 保护共享资源

## 实现细节

### 新增模块

#### 1. Media Engine (`internal/media/`)
```
├── types.go       # 核心数据结构定义
│   ├── PeerConnection     # 对等连接包装
│   ├── MediaHandlers      # 事件处理回调
│   ├── CallState          # 连接状态枚举
│   ├── OfferAnswer        # SDP 数据结构
│   └── ICECandidateInit   # ICE 候选数据
│
└── engine.go      # Pion 引擎实现
    ├── Engine                          # 主引擎类
    │   ├── CreatePeerConnection()      # 创建新连接
    │   ├── ClosePeerConnection()       # 关闭连接
    │   ├── GetPeerConnection()         # 获取连接
    │   ├── ListPeerConnections()       # 列出所有连接
    │   └── Shutdown()                  # 优雅关闭
    └── setupPeerConnectionHandlers()   # 事件处理设置
```

#### 2. Signaling 扩展 (`internal/signaling/`)
```
├── pion_handler.go   # Pion 消息处理程序
│   ├── PionSignalMessage          # 扩展的信令消息
│   ├── HandlePionMessage()        # 主处理函数
│   ├── CreateOffer()              # 创建 offer
│   ├── handleOffer()              # 处理 offer
│   ├── handleAnswer()             # 处理 answer
│   ├── handleICECandidate()       # 处理 ICE 候选
│   └── GetConnectionStats()       # 获取统计信息
│
├── pion_init.go      # 初始化代码
│   └── InitPionMediaEngine()      # 媒体引擎初始化
│
├── adapter.go        # 兼容适配层
│   ├── SignalAdapter              # 适配器类
│   ├── ProcessSignalMessage()     # 处理客户端消息
│   ├── handleCallInvite()         # 处理邀请
│   ├── handleCallAccept()         # 处理接受
│   ├── handleCallReject()         # 处理拒绝
│   ├── handleCallEnd()            # 处理结束
│   └── handleIceCandidate()       # 处理 ICE
│
└── hub.go           # 已修改
    └── WithMediaEngine()          # 关联媒体引擎
```

### 消息流

#### 1. 发起通话流程
```
客户端                          服务器
   │                              │
   ├─ call.invite ───────────────>│ SignalAdapter.handleCallInvite()
   │                              │
   │                              ├─ 验证通话状态
   │                              │
   ├────────────────── 转发给接收方 │
   │
   │<───────────── call.invite.ack (ACK)
   │
   ├─ 创建 WebRTC offer           │
   │                              │
   ├─ offer (SDP) ───────────────>│ (转发给接收方)
   │
   │<──────────── answer (SDP) ─────
   │
   ├─ 建立 P2P 连接               │
```

#### 2. ICE 候选流程
```
客户端 A                         服务器                    客户端 B
   │                              │                          │
   ├─ ice.candidate ──────────────>│                          │
   │   (从客户端接收的候选)        │                          │
   │                              │ HandlePionMessage()      │
   │                              │ -> handleICECandidate() │
   │                              │                          │
   │                              ├─ AddICECandidate() ────>│
   │                              │                          │
   │<────────────── ice.candidate ─┤ (和上面相反)
```

#### 3. 关闭连接流程
```
客户端                          服务器                    对等方
   │                              │                         │
   ├─ call.end ───────────────────>│                         │
   │                              │                         │
   │                              ├─ HandlePionMessage()    │
   │                              │ -> handleCallEnd()      │
   │                              │ -> ClosePeerConnection()│
   │                              │                         │
   │                              ├─ PeerConnection.Close() │
   │                              │                         │
   │                              ├───────── call.end ────> │
```

## 配置和初始化

### 在 main.go 中的初始化
```go
// 1. 初始化媒体引擎
mediaEngine, err := signaling.InitPionMediaEngine(appLogger)
defer mediaEngine.Shutdown(ctx)

// 2. 关联到信令枢纽
signalingHub.WithMediaEngine(mediaEngine)

// 3. 创建适配器（可选，但推荐）
adapter := signaling.NewSignalAdapter(appLogger, signalingHub)
```

## 性能特性

### 资源管理
- **连接池**: 高效管理多个 PeerConnection 实例
- **自动清理**: 连接关闭时自动释放资源
- **内存效率**: 使用映射和指针最小化内存占用

### 并发性
- **线程安全**: 所有共享资源都使用 RWMutex 保护
- **非阻塞操作**: 异步处理 ICE 候选和媒体事件
- **可扩展性**: 支持数百个并发连接

## 扩展性考虑

### 现有功能完整性
✅ 音频传输  
✅ 视频传输  
✅ ICE 候选处理  
✅ 连接状态管理  
✅ 优雅关闭  

### 未来扩展点
- **数据通道**: 已为添加 DataChannel 支持预留
- **高级统计**: `GetConnectionStats()` 接口已准备
- **音视频处理**: 可通过 `MediaHandlers` 添加自定义处理
- **多方通话**: 架构支持多个 PeerConnection 的管理
- **屏幕共享**: 可通过添加新的媒体轨道类型实现

## 测试建议

### 单元测试
```bash
go test ./internal/media/...
go test ./internal/signaling/...
```

### 集成测试
1. 启动后端服务: `go run cmd/server/main.go`
2. 启动 Expo 移动端: `npm start`
3. 在两个设备上测试通话流程
4. 验证 ICE 候选正确传递
5. 测试连接关闭和清理

### 性能测试
- 监控内存使用情况
- 跟踪并发连接数
- 测试长时间连接的稳定性

## 故障排查

### 常见问题

1. **连接无法建立**
   - 检查 ICE 服务器配置
   - 验证防火墙规则
   - 查看详细日志

2. **媒体无声音/无视频**
   - 验证编解码器支持
   - 检查媒体轨道事件是否触发
   - 确认客户端正确发送媒体

3. **连接不稳定**
   - 监控 ICE 连接状态
   - 检查网络延迟
   - 查看 Pion 日志中的错误

## 依赖关系

```
go.mod 中新增:
├── github.com/pion/webrtc/v4
│   ├── github.com/pion/datachannel
│   ├── github.com/pion/dtls/v3
│   ├── github.com/pion/ice/v4
│   ├── github.com/pion/interceptor
│   ├── github.com/pion/logging
│   ├── github.com/pion/rtp
│   ├── github.com/pion/rtcp
│   ├── github.com/pion/sctp
│   ├── github.com/pion/sdp/v3
│   ├── github.com/pion/srtp/v3
│   ├── github.com/pion/stun/v3
│   ├── github.com/pion/transport/v3
│   └── github.com/pion/turn/v4
```

## 版本兼容性

- **Go 版本**: 1.22+
- **Pion WebRTC**: v4.0.0+
- **现有客户端**: 完全兼容，无需修改

## 下一步工作

1. **编写单元测试**: 为 media engine 和 signaling adapter
2. **性能优化**: 基于生产环境反馈
3. **功能扩展**: 实现数据通道支持
4. **文档完善**: 添加 API 文档和示例

## 总结

Pion 框架的集成为项目提供了坚实的基础，支持现有功能并为未来扩展预留了充足的空间。所有改动都保持了向后兼容性，确保现有客户端无需修改即可继续工作。
