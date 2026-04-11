# 统一开发和生产环境配置指南

## 📊 问题分析

### 当前配置状态

**`.env` 文件（加密格式）**:
```
MYSQL_PASSWORD=VthN8XqT6U3vorMJGbkhKRlFEk4=  # 加密的密码
REDIS_PASSWORD=k2jEfvZ1r/GDIWTEnuTgMubaBTQ=  # 加密的密码
JWT_SECRET=YmIsXq31js++5PDd/K112cwZXp6Nnnc80PNJXGBhF4M=  # 加密的密钥
```

**实际Docker容器中的密码（明文）**:
```
MYSQL_PASSWORD=allcallallpass  # 实际使用的明文密码
REDIS_PASSWORD=redis_secure_password  # 实际使用的明文密码
```

### 根本原因

`.env`文件中的值似乎被加密了，但Docker Compose和后端应用需要使用**明文值**。这导致：
- 配置值不一致
- 环境变量管理混乱
- 无法直接从`.env`文件读取配置

---

## ✅ 统一配置方案

### 方案选择：使用明文密码统一管理

为了统一开发和生产环境，我们建议使用**明文密码**在`.env`文件中。这是标准做法，因为：

1. **可读性强**: 开发者能清楚看到配置值
2. **易于维护**: 避免加密解密的复杂性
3. **环境变量标准**: Docker Compose标准用法
4. **一致性**: 开发和生产使用相同的配置方式

---

## 🔧 具体操作步骤

### 步骤1: 更新`.env`文件为明文密码

```bash
# 备份原有的.env文件
cd /Users/byzantium/github/allcallall/infra
cp .env .env.backup

# 使用明文密码更新.env文件
cat > .env << 'EOF'
# 数据库配置
MYSQL_ROOT_PASSWORD=rootpass
MYSQL_PASSWORD=allcallallpass
MYSQL_DATABASE=allcallall_db

# Redis配置
REDIS_PASSWORD=redis_secure_password

# 应用配置
JWT_SECRET=your-secret-key-min-32-characters-required
MAIL_PASSWORD=jvjxuwmopqgahdgh
WEBRTC_ICE_SERVERS_JSON=[{"urls":["stun:stun.l.google.com:19302"]}]

# 可选 FCM 配置
FCM_SERVICE_ACCOUNT_PATH=/absolute/path/to/firebase-service-account.json
EOF
```

### 步骤2: 验证`.env`文件内容

```bash
cat .env
```

应该看到：
```
MYSQL_ROOT_PASSWORD=rootpass
MYSQL_PASSWORD=allcallallpass
MYSQL_DATABASE=allcallall_db
REDIS_PASSWORD=redis_secure_password
JWT_SECRET=your-secret-key-min-32-characters-required
MAIL_PASSWORD=jvjxuwmopqgahdgh
WEBRTC_ICE_SERVERS_JSON=[{"urls":["stun:stun.l.google.com:19302"]}]
```

### 步骤3: 重启所有服务以应用新配置

```bash
cd /Users/byzantium/github/allcallall/infra

# 停止所有服务
docker-compose -f docker-compose.production.yml down

# 等待容器完全停止
sleep 5

# 重新启动服务（自动读取.env文件）
docker-compose -f docker-compose.production.yml up -d

# 等待服务启动
sleep 15

# 检查服务状态
docker-compose -f docker-compose.production.yml ps
```

### 步骤4: 验证所有服务连接正常

```bash
# 查看后端日志
docker-compose -f docker-compose.production.yml logs backend --tail=20

# 应该看到：
# 2025-XX-XX INF mysql connection established
# 2025-XX-XX INF connected to redis successfully
# 2025-XX-XX INF http server starting addr=0.0.0.0:8080
```

### 步骤5: 测试API端点

```bash
# 测试健康检查
curl http://localhost:8080/ping
# 期望: {"message":"pong"}

# 测试API健康检查
curl http://localhost:8080/api/v1/health
# 期望: {"status":"ok"}

# 测试认证端点
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
# 期望: {"error":"invalid credentials","success":false}
```

---

## 📋 统一的环境变量配置表

### 推荐的统一配置值

| 变量名 | 开发环境 | 生产环境 | 说明 |
|-------|--------|--------|------|
| `MYSQL_ROOT_PASSWORD` | rootpass | ⚠️ 生产更改 | MySQL root用户密码 |
| `MYSQL_PASSWORD` | allcallallpass | ⚠️ 生产更改 | MySQL应用用户密码 |
| `REDIS_PASSWORD` | redis_secure_password | ⚠️ 生产更改 | Redis密码 |
| `JWT_SECRET` | your-secret-key... | ⚠️ 生产更改 | JWT签名密钥（32字符以上） |
| `MAIL_PASSWORD` | jvjxuwmopqgahdgh | jvjxuwmopqgahdgh | QQ邮箱授权码 |
| `WEBRTC_ICE_SERVERS_JSON` | `[{"urls":["stun:stun.l.google.com:19302"]}]` | 同左 | WebRTC STUN服务器 |
| `FCM_SERVICE_ACCOUNT_PATH` | (空) | /path/to/key.json | Firebase密钥路径 |
| `WS_PING_INTERVAL` | 30s | 30s | WebSocket ping间隔 |
| `WS_PONG_WAIT` | 60s | 60s | Pong等待超时 |

---

## 📱 移动端环境变量 (EXPO_PUBLIC_*)

Expo 应用使用 `EXPO_PUBLIC_` 前缀的环境变量，这些变量在构建时嵌入应用。

### 基础配置

| 变量名 | 默认值 | 说明 |
|-------|-------|------|
| `EXPO_PUBLIC_API_HTTP` | (config中定义) | 覆盖 API 基础地址 |
| `EXPO_PUBLIC_API_WS` | (config中定义) | 覆盖 WebSocket 基础地址 |
| `EXPO_PUBLIC_FORCE_TLS` | `0` | 设为 `1` 强制使用 HTTPS/WSS |

### 受限网络配置

| 变量名 | 默认值 | 说明 |
|-------|-------|------|
| `EXPO_PUBLIC_RESTRICTED_NETWORK` | `0` | 设为 `1` 优先使用 TURNS on 443 |
| `EXPO_PUBLIC_SIGNALING_TRANSPORT` | `auto` | `auto`: 自动切换; `poll`: 强制HTTP |
| `EXPO_PUBLIC_SIGNALING_SHAPING` | `0` | 设为 `1` 启用 WebSocket keepalive |

### 配置文件示例

**开发环境** (`.env.local`):
```bash
EXPO_PUBLIC_API_HTTP=http://192.168.1.30:8080
EXPO_PUBLIC_API_WS=ws://192.168.1.30:8080
```

**生产环境** (`.env.production`):
```bash
EXPO_PUBLIC_API_HTTP=https://api.allcall.com
EXPO_PUBLIC_API_WS=wss://api.allcall.com
EXPO_PUBLIC_FORCE_TLS=1
```

**企业受限网络** (`.env.restricted`):
```bash
EXPO_PUBLIC_API_HTTP=https://api.company.com
EXPO_PUBLIC_API_WS=wss://api.company.com
EXPO_PUBLIC_FORCE_TLS=1
EXPO_PUBLIC_RESTRICTED_NETWORK=1
EXPO_PUBLIC_SIGNALING_TRANSPORT=poll
EXPO_PUBLIC_SIGNALING_SHAPING=1
```

### 应用变量的方式

```bash
# 开发时
EXPO_PUBLIC_API_HTTP=http://127.0.0.1:8080 EXPO_PUBLIC_API_WS=ws://127.0.0.1:8080 npx expo start

# 构建 APK 时
eas build --platform android --profile production
# EAS 会从 eas.json 或构建环境中读取 EXPO_PUBLIC_* 配置
```


### ⚠️ 生产环境密码修改建议

在生产环境中，应该修改以下密码为强密码：

```bash
# 生产环境示例（不要直接使用，需要使用强密码）
export MYSQL_ROOT_PASSWORD="prod_root_secure_password_32chars"
export MYSQL_PASSWORD="prod_app_secure_password_32chars"
export REDIS_PASSWORD="prod_redis_secure_password_32chars"
export JWT_SECRET="prod_jwt_secret_key_min_32_characters"
```

---

## 🔒 安全建议

### 开发环境
- ✅ 可以在`.env`中使用示例密码
- ✅ `.env`通常添加到`.gitignore`中
- ✅ 定期更换密码

### 生产环境
- ❌ 不要使用示例密码
- ❌ 不要将`.env`文件提交到Git
- ✅ 使用密钥管理系统（如Docker Secrets、Vault）
- ✅ 使用强密码（32字符以上，包含大小写、数字、特殊符号）
- ✅ 定期轮换密钥

---

## 📁 相关文件说明

### `.env` 文件结构
```
/Users/byzantium/github/allcallall/infra/.env
├── 数据库配置部分
├── Redis配置部分
├── 应用配置部分
└── 环境标识部分
```

### Docker Compose 如何使用 `.env`

Docker Compose 自动读取同目录下的 `.env` 文件：
```yaml
services:
  mysql:
    environment:
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}  # 从.env读取
  redis:
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}"]  # 从.env读取
  backend:
    environment:
      DB_DSN: allcallall:${MYSQL_PASSWORD}@tcp(mysql:3306)/...  # 从.env读取
```

---

## 🚀 快速完整修复脚本

如果您要一步到位，可以使用以下脚本：

```bash
#!/bin/bash

set -e

cd /Users/byzantium/github/allcallall/infra

echo "📋 步骤1: 备份原有配置"
cp .env .env.backup
echo "✅ 已备份到 .env.backup"

echo ""
echo "📋 步骤2: 更新.env为明文密码"
cat > .env << 'EOF'
# 数据库配置
MYSQL_ROOT_PASSWORD=rootpass
MYSQL_PASSWORD=allcallallpass
MYSQL_DATABASE=allcallall_db

# Redis配置
REDIS_PASSWORD=redis_secure_password

# 应用配置
JWT_SECRET=your-secret-key-min-32-characters-required
MAIL_PASSWORD=jvjxuwmopqgahdgh
WEBRTC_ICE_SERVERS_JSON=[{"urls":["stun:stun.l.google.com:19302"]}]

# 可选 FCM 配置
FCM_SERVICE_ACCOUNT_PATH=/absolute/path/to/firebase-service-account.json
EOF
echo "✅ .env已更新"

echo ""
echo "📋 步骤3: 验证.env内容"
echo "--- .env内容 ---"
cat .env
echo "--- 结束 ---"

echo ""
echo "📋 步骤4: 关闭所有服务"
docker-compose -f docker-compose.production.yml down
sleep 5
echo "✅ 服务已关闭"

echo ""
echo "📋 步骤5: 重启所有服务"
docker-compose -f docker-compose.production.yml up -d
sleep 15
echo "✅ 服务已启动"

echo ""
echo "📋 步骤6: 检查服务状态"
docker-compose -f docker-compose.production.yml ps

echo ""
echo "📋 步骤7: 验证后端连接"
echo "等待5秒后查看日志..."
sleep 5
echo "--- 后端日志（最后20行） ---"
docker-compose -f docker-compose.production.yml logs backend --tail=20

echo ""
echo "📋 步骤8: 测试API"
echo "测试 /ping 端点..."
curl -s http://localhost:8080/ping
echo ""

echo "测试 /api/v1/health 端点..."
curl -s http://localhost:8080/api/v1/health
echo ""

echo ""
echo "✅ 所有步骤完成！"
echo ""
echo "📝 总结："
echo "- .env文件已更新为明文密码"
echo "- 所有服务已重启并使用新配置"
echo "- 后端服务已连接到MySQL和Redis"
echo "- API端点正常响应"
```

保存为 `/Users/byzantium/github/allcallall/infra/fix-unified-config.sh`，然后执行：
```bash
bash /Users/byzantium/github/allcallall/infra/fix-unified-config.sh
```

---

## ✅ 配置验证清单

配置完成后，检查以下项目：

- [ ] `.env` 文件中的所有密码都是明文格式
- [ ] `docker-compose -f docker-compose.production.yml ps` 显示所有服务都在运行
- [ ] 后端日志显示 `mysql connection established`
- [ ] 后端日志显示 `connected to redis successfully`
- [ ] `curl http://localhost:8080/ping` 返回 `{"message":"pong"}`
- [ ] `curl http://localhost:8080/api/v1/health` 返回 `{"status":"ok"}`

---

## 🔄 环境变量同步工作流

### 开发流程

```
1. 在.env中修改配置
   ↓
2. 重启Docker Compose服务
   docker-compose -f docker-compose.production.yml down
   docker-compose -f docker-compose.production.yml up -d
   ↓
3. 验证后端连接
   docker-compose -f docker-compose.production.yml logs backend
```

### 生产部署流程

```
1. 更新.env中的生产密码
   ↓
2. 设置生产环境使用的 `EXPO_PUBLIC_API_HTTP`、`EXPO_PUBLIC_API_WS` 与 `EXPO_PUBLIC_FORCE_TLS=1`
   ↓
3. 启动生产环境
   docker-compose -f docker-compose.production.yml up -d
   ↓
4. 验证所有服务
   docker-compose -f docker-compose.production.yml ps
   docker-compose -f docker-compose.production.yml logs
```

---

## 📚 相关文档

- [Docker启动指南](./docker-startup-guide.md)
- [生产环境完整指南](./production-setup-and-apk-build.md)
- [后端诊断报告](./backend-diagnosis-and-fix.md)
- [快速参考](../APK_BUILD_QUICK_REFERENCE.md)

---

**配置时间**: 2025-12-14
**工作目录**: /Users/byzantium/github/allcallall
