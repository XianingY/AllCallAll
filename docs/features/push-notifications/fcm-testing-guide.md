# FCM 推送通知实现测试指南

## 测试前的准备

### 1. 启动后端服务
```bash
cd /Users/byzantium/github/allcallall/backend
go run ./cmd/server
```

确保看到以下日志：
```
user service attached to signaling hub
fcm manager attached to signaling hub
```

### 2. 编译和运行移动端应用
```bash
cd /Users/byzantium/github/allcallall/mobile
npm start
```

## 测试场景

### 测试 1：FCM Token 登录发送验证

**目标**: 确认登录时 FCM Token 成功发送到后端

**步骤**:
1. 打开移动端应用
2. 进入登录界面
3. 输入有效的邮箱和密码
4. 点击登录按钮

**预期结果**:
- 后端日志显示：
  ```
  [UserHandler] fcm token saved
  user_id=XXX fcm_token=abc123def456...
  ```
- 移动端日志显示：
  ```
  [AuthContext] Failed to send FCM token: ...
  [PushNotificationService] Error syncing token to backend: ...
  ```

**验证命令** (在后端运行):
```bash
# 查询数据库，确认 FCM Token 已保存
mysql -u root -p your_password allcallall -e \
  "SELECT id, email, fcm_token FROM users WHERE email='your@email.com';"
```

应该看到 `fcm_token` 字段包含数据（不为 NULL）。

### 测试 2：数据库字段验证

**目标**: 确认数据库已正确添加 fcm_token 列

**步骤**:
1. 连接到 MySQL 数据库
2. 查看 users 表结构

**命令**:
```bash
mysql -u root -p your_password allcallall -e \
  "DESCRIBE users;"
```

**预期结果**:
```
+-----------------+----------------------------------+------+-----+---------+----------------+
| Field           | Type                             | Null | Key | Default | Extra          |
+-----------------+----------------------------------+------+-----+---------+----------------+
| id              | bigint unsigned                  | NO   | PRI | NULL    | auto_increment |
| ...             | ...                              | ...  | ... | ...     | ...            |
| fcm_token       | varchar(255)                     | YES  | MUL | NULL    |                |
+-----------------+----------------------------------+------+-----+---------+----------------+
```

### 测试 3：API 端点验证

**目标**: 确认 `POST /users/fcm-token` 端点正常工作

**前置条件**: 已有有效的 JWT token

**命令**:
```bash
curl -X POST http://localhost:8080/api/v1/users/fcm-token \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fcm_token": "test_fcm_token_12345"
  }'
```

**预期响应**:
```json
{
  "message": "fcm token saved successfully"
}
```

**后端日志应显示**:
```
[UserHandler] fcm token saved
user_id=1 fcm_token=test_fcm_token_12345
```

### 测试 4：来电推送通知触发验证

**目标**: 确认当发起通话时，推送通知逻辑被触发

**前置条件**: 
- 两个已登录的用户账户
- 用户 B 的 FCM Token 已保存在数据库

**步骤**:
1. 用户 A 拨打用户 B
2. 观察后端日志

**预期后端日志**:
```
[SignalingHub] call invite received, preparing media connection
2026-XX-XX INF call notification sent component=fcm_manager from=user_a@example.com call_id=uuid-string message_id=projects/.../messages/...
```

**如果启用了详细日志**:
```
2026-XX-XX INF fcm enabled component=fcm_manager credentials_path=/absolute/path/to/firebase-service-account.json
2026-XX-XX INF call notification sent component=fcm_manager from=user_a@example.com call_id=uuid-string message_id=projects/.../messages/...
```

## 故障排除

### 问题 1：FCM Token 未保存

**症状**: 登录后，数据库中 fcm_token 仍为 NULL

**可能原因**:
- PushNotificationService 未正确初始化
- 网络连接问题
- 后端 FCM Token 端点未暴露

**排查步骤**:
1. 检查移动端日志：
   ```
   [AuthContext] Failed to send FCM token: ...
   [PushNotificationService] Error syncing token to backend: ...
   ```

2. 检查后端是否接收到请求：
   ```
   # 启用调试模式
   GIN_MODE=debug go run ./cmd/server
   ```

3. 确认 PushNotificationService 中的 sendCurrentTokenToBackend 方法返回值

### 问题 2：推送通知未触发

**症状**: 发起通话时，后端日志未显示推送通知相关信息

**可能原因**:
- FCM Manager 未附加到信令 Hub
- User Service 未附加到信令 Hub
- 接收者未登录（客户端未连接到 WebSocket）

**排查步骤**:
1. 检查后端启动日志：
   ```
   [SignalingHub] user service attached to signaling hub
   [SignalingHub] fcm manager attached to signaling hub
   ```

2. 验证接收者已连接：
   ```
   [SignalingHub] client connected
   email=user_b@example.com
   ```

3. 检查接收者的 FCM Token 是否存在：
   ```bash
   mysql -u root -p your_password allcallall -e \
     "SELECT fcm_token FROM users WHERE email='user_b@example.com';"
   ```

### 问题 3：后端编译失败

**错误**: `undefined ... (type *Hub has no field or method ...)`

**解决**:
- 确保所有文件已保存
- 清理编译缓存：
  ```bash
  go clean -cache
  go build ./cmd/server
  ```

## 完整的端到端测试

### 场景：用户 A 拨打用户 B，期望 B 收到推送通知

**前置设置**:
1. 启动后端服务
2. 启动移动端应用
3. 创建两个测试账户：
   - 账户 A: `user_a@example.com` / `password123`
   - 账户 B: `user_b@example.com` / `password123`

**执行步骤**:

1. **第一个模拟器/设备 - 用户 A 登录**
   ```
   输入邮箱: user_a@example.com
   输入密码: password123
   点击登录
   ```
   观察后端日志：`fcm token saved`

2. **第二个模拟器/设备 - 用户 B 登录**
   ```
   输入邮箱: user_b@example.com
   输入密码: password123
   点击登录
   ```
   观察后端日志：`fcm token saved`

3. **验证数据库**
   ```bash
   mysql -u root -p your_password allcallall -e \
     "SELECT email, fcm_token FROM users WHERE email IN ('user_a@example.com', 'user_b@example.com');"
   ```
   确保两个用户都有 fcm_token

4. **用户 A 拨打用户 B**
   在用户 A 的设备上：
   - 进入通讯录
   - 搜索 user_b@example.com
   - 点击拨打

5. **观察后端日志**
   ```
   2026-XX-XX INF call notification sent component=fcm_manager from=user_a@example.com call_id=uuid-string message_id=projects/.../messages/...
   ```

## Firebase 发送验证

当前实现已经直接使用 Firebase Admin SDK。启用后，以下日志表示推送通知已成功发送：

```
2026-XX-XX INF fcm enabled component=fcm_manager credentials_path=/absolute/path/to/firebase-service-account.json
2026-XX-XX INF call notification sent component=fcm_manager from=user_a@example.com call_id=uuid-string message_id=projects/.../messages/...
from_email=user_a@example.com
call_id=uuid
msg="call notification sent successfully"
```

并且用户 B 的设备应该收到推送通知：
- 应用在前台：显示来电屏幕
- 应用在后台：显示系统通知

## 性能指标

### 预期性能

| 操作 | 时间 | 备注 |
|------|------|------|
| 登录+FCM Token 发送 | < 2秒 | 包括网络往返 |
| 来电推送通知触发 | < 1秒 | 异步执行 |
| 数据库写入 | < 100ms | FCM Token 保存 |

## 日志级别配置

### 启用调试日志

在启动后端时设置环境变量：
```bash
LOG_LEVEL=debug go run ./cmd/server
```

这将显示更详细的信息，包括：
- 用户服务操作
- FCM Token 查询和保存
- 推送通知发送过程

### 查看特定组件日志

```bash
# 仅查看 FCM 相关日志
go run ./cmd/server 2>&1 | grep -i "fcm"

# 仅查看信令 Hub 日志
go run ./cmd/server 2>&1 | grep -i "signaling"

# 仅查看用户处理器日志
go run ./cmd/server 2>&1 | grep -i "user"
```

## 下一步

当所有测试验证通过后，下一步是：

1. **配置 Firebase**
   - 在 Firebase Console 创建项目
   - 添加 Android 应用
   - 下载 google-services.json
   - 获取服务账户密钥

2. **集成 Firebase Admin SDK**
   - 在 go.mod 中添加依赖
   - 更新 fcm/manager.go 实现真实的推送逻辑
   - 在 main.go 中初始化 Firebase 客户端

3. **实际测试**
   - 使用真实的 Firebase 推送通知
   - 验证在应用后台时能接收通知
   - 测试各种网络条件下的可靠性
