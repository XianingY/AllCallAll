# AllCallAll API 接口文档

## 📋 概述

AllCallAll 提供了完整的 REST API 和 WebSocket 接口，用于支持实时音视频通信功能。

- **基础URL**: `http://localhost:8080` (开发环境)
- **API版本**: v1
- **认证方式**: JWT Bearer Token
- **数据格式**: JSON
- **WebSocket**: 支持实时信令传输

## 🔐 认证

除注册、登录、发送验证码外，所有 API 都需要在请求头中携带 JWT Token：

```http
Authorization: Bearer <your_jwt_token>
```

## 📡 REST API 接口

### 1. 健康检查

#### GET /api/v1/health

检查服务状态。

**响应示例**:
```json
{
  "status": "ok"
}
```

### 2. 用户认证

#### POST /api/v1/auth/register

用户注册。

**请求体**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "display_name": "张三"
}
```

**响应示例**:
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "display_name": "张三"
  },
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### POST /api/v1/auth/login

用户登录。

**请求体**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**响应示例**:
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "display_name": "张三"
  },
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### POST /api/v1/auth/refresh

刷新访问令牌。

**请求体**:
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 3. 邮件验证

#### POST /api/v1/email/send-verification-code

发送邮箱验证码。

**请求体**:
```json
{
  "email": "user@example.com"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "验证码已发送"
}
```

#### POST /api/v1/email/verify

验证邮箱验证码。

**请求体**:
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "验证成功"
}
```

### 4. 用户管理

#### GET /api/v1/users/profile

获取当前用户信息。

**响应示例**:
```json
{
  "id": 1,
  "email": "user@example.com",
  "display_name": "张三",
  "created_at": "2024-01-01T00:00:00Z"
}
```

#### GET /api/v1/users/search

搜索用户。

**查询参数**:
- `query`: 搜索关键词（邮箱或昵称）

**响应示例**:
```json
{
  "users": [
    {
      "id": 2,
      "email": "user2@example.com",
      "display_name": "李四"
    }
  ]
}
```

#### GET /api/v1/users/contacts

获取联系人列表。

**响应示例**:
```json
{
  "contacts": [
    {
      "id": 2,
      "email": "user2@example.com",
      "display_name": "李四",
      "status": "online"
    }
  ]
}
```

#### POST /api/v1/users/contacts

添加联系人。

**请求体**:
```json
{
  "user_id": 2
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "联系人已添加"
}
```

#### GET /api/v1/users/presence

获取用户在线状态。

**查询参数**:
- `user_ids`: 用户ID列表（逗号分隔）

**响应示例**:
```json
{
  "users": [
    {
      "id": 2,
      "status": "online",
      "last_seen": "2024-01-01T12:00:00Z"
    }
  ]
}
```

## 🔌 WebSocket 接口

### WebSocket 端点

**URL**: `ws://localhost:8080/api/v1/ws`

**认证方式**:
1. 在 URL 查询参数中携带 token: `ws://localhost:8080/api/v1/ws?token=<jwt_token>`
2. 在连接建立后发送认证消息

### 连接流程

1. 建立 WebSocket 连接
2. 发送认证消息（如果未在 URL 中携带 token）
3. 开始交换信令消息

### 认证消息格式

```json
{
  "type": "auth",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**响应**:
```json
{
  "type": "auth_response",
  "success": true,
  "message": "认证成功"
}
```

### 信令消息格式

#### 1. 加入通话

```json
{
  "type": "join_call",
  "call_id": "call-123",
  "direction": "incoming" // 或 "outgoing"
}
```

#### 2. 离开通话

```json
{
  "type": "leave_call",
  "call_id": "call-123"
}
```

#### 3. WebRTC Offer

```json
{
  "type": "offer",
  "call_id": "call-123",
  "sdp": "v=0\r\no=-..."
}
```

#### 4. WebRTC Answer

```json
{
  "type": "answer",
  "call_id": "call-123",
  "sdp": "v=0\r\no=-..."
}
```

#### 5. ICE Candidate

```json
{
  "type": "ice_candidate",
  "call_id": "call-123",
  "candidate": {
    "candidate": "candidate:0 1 UDP 2122252543 192.168.1.1 12345 typ host",
    "sdpMLineIndex": 0,
    "sdpMid": "0"
  }
}
```

#### 6. 媒体控制命令

```json
{
  "type": "media_command",
  "call_id": "call-123",
  "command": "start_audio" // start_audio, stop_audio, start_video, stop_video
}
```

### 消息响应

服务器会返回以下类型的消息：

#### 错误响应

```json
{
  "type": "error",
  "code": "INVALID_TOKEN",
  "message": "无效的认证令牌"
}
```

#### 状态通知

```json
{
  "type": "call_state",
  "call_id": "call-123",
  "state": "connecting" // idle, connecting, in_call, ended
}
```

#### 用户状态

```json
{
  "type": "user_presence",
  "user_id": 2,
  "status": "online" // online, offline
}
```

## 🔄 通话流程

### 1. 发起呼叫流程

```
1. 用户A发起呼叫
   ├─ WebSocket: 发送 join_call (outgoing)
   ├─ WebRTC: 创建 PeerConnection
   ├─ WebSocket: 发送 offer (包含SDP)
   │
2. 用户B接收呼叫
   ├─ WebSocket: 接收 join_call (incoming)
   ├─ WebRTC: 接收并处理 offer
   ├─ WebSocket: 发送 answer (包含SDP)
   │
3. 建立连接
   ├─ 交换 ICE candidates
   ├─ 媒体流开始传输
   ├─ 双方进入 in_call 状态
```

### 2. 媒体控制流程

```
开始音频:
  ├─ 客户端: 启用麦克风
  └─ WebSocket: 发送 media_command { command: "start_audio" }

停止音频:
  ├─ 客户端: 禁用麦克风
  └─ WebSocket: 发送 media_command { command: "stop_audio" }
```

## 📊 状态码

### HTTP 状态码

- `200` - 请求成功
- `201` - 创建成功
- `400` - 请求参数错误
- `401` - 未认证
- `403` - 权限不足
- `404` - 资源不存在
- `409` - 冲突（如邮箱已存在）
- `500` - 服务器内部错误

### WebSocket 错误码

- `INVALID_TOKEN` - 无效的认证令牌
- `CALL_NOT_FOUND` - 通话不存在
- `INVALID_MESSAGE` - 无效的消息格式
- `PEER_NOT_FOUND` - 对端用户不存在
- `ICE_SERVER_ERROR` - ICE 服务器错误

## 🔒 安全注意事项

1. **Token 保护**: 不要在客户端代码中暴露 JWT secret
2. **HTTPS/WSS**: 生产环境必须使用 HTTPS/WSS
3. **Token 过期**: 访问令牌默认 60 分钟过期，需要定期刷新
4. **CORS**: 仅允许可信域名访问 API
5. **Rate Limiting**: 建议对 API 接口实施限流

## 🧪 测试工具

### 使用 curl 测试 REST API

```bash
# 用户注册
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","display_name":"测试用户"}'

# 用户登录
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### 使用 wscat 测试 WebSocket

```bash
# 安装 wscat
npm install -g wscat

# 连接 WebSocket
wscat -c ws://localhost:8080/api/v1/ws?token=<your_jwt_token>

# 发送消息
> {"type":"join_call","call_id":"test-call","direction":"outgoing"}
```

## 📝 注意事项

1. **连接保持**: WebSocket 连接会因网络问题断开，需要实现重连机制
2. **消息顺序**: 消息需要按顺序处理，避免并发问题
3. **错误处理**: 所有 API 都需要实现适当的错误处理
4. **日志记录**: 重要操作需要记录日志以便调试
5. **资源清理**: 通话结束后需要清理 WebRTC 资源

## 🔗 相关文档

- [配置说明](./configuration.md)
- [数据库文档](./database.md)
- [部署指南](./deployment-guide.md)
- [安全指南](../configuration/security-guidelines.md)
