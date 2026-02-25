# AllCallAll 云服务器部署指南

## 目录
1. [环境准备](#环境准备)
2. [后端服务部署](#后端服务部署)
3. [移动应用配置](#移动应用配置)
4. [HTTPS/SSL 配置](#httpssl-配置)
5. [防火墙和安全组](#防火墙和安全组)
6. [域名配置](#域名配置)
7. [推送通知配置 (FCM)](#推送通知配置-fcm)
8. [TURN/TURNS 服务器配置](#turnturns-服务器配置)
9. [端到端加密 (E2EE)](#端到端加密-e2ee)
10. [受限网络部署](#受限网络部署)
11. [性能优化](#性能优化)
12. [故障排查](#故障排查)
13. [命令速查](#命令速查)

---

## 部署架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                    互联网用户 (Internet Users)                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                   公网 IP: 81.68.168.207
                   域名: api.allcall.com
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
        ▼                                       ▼
   HTTP:80 ───────────────────────────────► HTTPS:443
   (自动重定向到 HTTPS)                   (安全连接)
        │
        ▼
   ┌──────────────────────────────────────────────┐
   │            Nginx 反向代理 + SSL/TLS          │
   │  • HTTP/HTTPS 协议转换                       │
   │  • 负载均衡                                   │
   │  • 静态文件服务                               │
   │  • 路由转发                                   │
   └──────────────┬───────────────────────────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
   ┌─────────┐ ┌────────┐ ┌──────────┐
   │ Backend │ │ MySQL  │ │  Redis   │
   │  API    │ │  DB    │ │  Cache   │
   │(8080)   │ │(3306)  │ │ (6379)   │
   └─────────┘ └────────┘ └──────────┘
        │         │           │
        └─────────┴───────────┘
              Docker Compose
              (在 /opt/allcallall/infra)

┌──────────────────────────────────────────────────────┐
│         移动应用 (Mobile App - Android/iOS)          │
│  • 通过公网 IP 或域名连接                            │
│  • HTTPS API 调用                                   │
│  • WSS WebSocket 信令连接                           │
│  • HTTPS Long-Poll 信令 (备用通道)                  │
│  • WebRTC 点对点视频通话                            │
│  • E2EE 密钥交换 (DataChannel)                      │
└──────────────────────────────────────────────────────┘
```

### 服务端口概览

| 组件 | 端口 | 容器网络 | 外网访问 |
|------|------|---------|---------| 
| Go API | 8080 | 内部 | 通过 Nginx 代理 |
| MySQL | 3306 | 内部 | ❌ 不开放 |
| Redis | 6379 | 内部 | ❌ 不开放 |
| Nginx | 80/443 | 外部 | ✅ 开放 |

---

## 环境准备

### 云服务器信息
- **公网 IP**: 81.68.168.207
- **操作系统**: Ubuntu 20.04 LTS 或更新版本
- **CPU**: 2+ 核心（推荐 4 核）
- **内存**: 4GB+ （推荐 8GB）
- **存储**: 20GB+ （推荐 50GB）

### 1. SSH 连接到服务器
```bash
ssh -i /path/to/key.pem ubuntu@81.68.168.207
```

### 2. 系统更新和必要软件安装
```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装必要工具
sudo apt install -y curl wget git net-tools htop

# 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 将当前用户加入 docker 组
sudo usermod -aG docker $USER
newgrp docker

# 安装 Docker Compose V2 插件
sudo apt install -y docker-compose-plugin

# 验证安装
docker --version
docker compose version
```

### 3. 克隆项目代码

> **自定义部署路径**: 默认部署到 `/opt/allcallall`，可通过以下方式自定义：
> - 环境变量: `export WORK_DIR=/your/path`
> - 命令行参数: `bash deploy-cloud.sh <ip> <domain> /your/path`

```bash
cd /opt
sudo mkdir -p /opt/allcallall
sudo chown -R $USER:$USER /opt/allcallall
cd /opt/allcallall
git clone https://github.com/yourusername/allcall.git .
```

---

## 后端服务部署

### 1. 配置文件准备

#### 创建生产环境配置
```bash
# 编辑配置文件
sudo nano /opt/allcallall/backend/configs/config.production.yaml
```

**config.production.yaml 内容**:
```yaml
server:
  host: "0.0.0.0"
  port: 8080
  read_timeout_seconds: 10
  write_timeout_seconds: 15
  idle_timeout_seconds: 60

database:
  # 改为容器内的 mysql 地址
  dsn: "allcallall:allcallallpass@tcp(mysql:3306)/allcallall_db?parseTime=true&charset=utf8mb4&loc=Local"
  max_open_conns: 50
  max_idle_conns: 10
  conn_max_lifetime_minutes: 30

redis:
  # 改为容器内的 redis 地址
  addr: "redis:6379"
  username: ""
  password: ""
  db: 0

mail:
  host: "smtp.qq.com"
  port: 587
  username: "1569297330@qq.com"
  password: "${MAIL_PASSWORD}"
  from: "1569297330@qq.com"
  from_name: "AllCallAll"
  max_retries: 3
  retry_delay_seconds: 5

jwt:
  # ⚠️ 务必更改为安全的密钥！
  secret: "${JWT_SECRET}"
  issuer: "allcallall-backend"
  access_token_ttl_minutes: 60
  refresh_token_ttl_hours: 168

webrtc:
  ice_servers:
    - urls:
        - "stun:stun.l.google.com:19302"
        - "stun:stun1.l.google.com:19302"

logging:
  level: "info"
```

### 2. Docker 环境变量文件

**创建 .env 文件**:
```bash
# /opt/allcallall/.env
MAIL_PASSWORD=your_qq_email_auth_code
JWT_SECRET=your-secure-jwt-secret-here-change-it
MYSQL_ROOT_PASSWORD=strong_root_password_change_this
MYSQL_PASSWORD=strong_db_password_change_this
APP_ENV=production
```

### 3. 修改 docker-compose.production.yml

```yaml
# /opt/allcallall/infra/docker-compose.production.yml
services:
  mysql:
    image: mysql:8.0
    command: --default-authentication-plugin=mysql_native_password
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: allcallall_db
      MYSQL_USER: allcallall
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    restart: unless-stopped
    networks:
      - allcallall_network

  redis:
    image: redis:7.2
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: ["redis-server", "--save", "60", "1", "--loglevel", "warning", "--requirepass", "${REDIS_PASSWORD}"]
    restart: unless-stopped
    networks:
      - allcallall_network

  backend:
    build:
      context: ../backend
      dockerfile: Dockerfile
    depends_on:
      - mysql
      - redis
    environment:
      APP_ENV: production
      DB_DSN: allcallall:${MYSQL_PASSWORD}@tcp(mysql:3306)/allcallall_db?parseTime=true&charset=utf8mb4&loc=Local
      REDIS_ADDR: redis:6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
      MAIL_PASSWORD: ${MAIL_PASSWORD}
      HTTP_PORT: "8080"
      CONFIG_PATH: /app/configs/config.yaml
    ports:
      - "8080:8080"
    volumes:
      - ./backend/configs:/app/configs:ro
    restart: unless-stopped
    networks:
      - allcallall_network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:latest
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - ./html:/usr/share/nginx/html
    depends_on:
      - backend
    restart: unless-stopped
    networks:
      - allcallall_network

volumes:
  mysql_data:
  redis_data:

networks:
  allcallall_network:
    driver: bridge
```

### 4. 启动服务

```bash
cd /opt/allcallall/infra
docker compose -f docker-compose.production.yml up -d --build

# 查看启动状态
docker compose -f docker-compose.production.yml ps

# 查看日志
docker compose -f docker-compose.production.yml logs -f backend

# 测试后端
curl http://81.68.168.207/api/v1/health
```

---

## 移动应用配置

### 1. 更新 API 配置文件

**编辑 `/mobile/src/config/index.ts`**:

```typescript
import { Platform } from "react-native";
import * as Device from "expo-device";

// 开发环境（本地）
const DEV_API = {
  HTTP: "http://192.168.31.217:8080",
  WS: "ws://192.168.31.217:8080"
};

// 生产环境（云服务器）
const PROD_API = {
  HTTP: "https://api.allcall.com", // 使用你的域名或直接用 IP
  WS: "wss://api.allcall.com"      // 必须是 wss://（安全 WebSocket）
};

// 或者使用公网 IP（暂时）
const PROD_API_IP = {
  HTTP: "http://81.68.168.207:8080",
  WS: "ws://81.68.168.207:8080"
};

// 根据环境选择配置
const __DEV__ = true; // 在构建时修改为 false（生产环境）

const API_CONFIG = __DEV__ ? DEV_API : PROD_API;

const isPhysicalAndroid = Platform.OS === "android" && Device.isDevice;

const API_HOST = API_CONFIG.HTTP;
const WS_HOST = API_CONFIG.WS;

export const API_BASE_URL = `${API_HOST}/api/v1`;
export const WS_URL = `${WS_HOST}/api/v1/ws`;
export const REQUEST_TIMEOUT = 10_000;
```

### 2. 构建和部署

```bash
cd /Users/byzantium/github/allcall/mobile

# 为生产环境构建
eas build --platform android --release

# 或者使用 Expo 生成 APK
expo build:android

# 分发 APK 给用户
```

---

## HTTPS/SSL 配置

### 1. 使用 Let's Encrypt 获取免费证书

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取证书（假设你已配置域名）
sudo certbot certonly --standalone -d api.allcall.com -d allcall.com

# 证书位置
# /etc/letsencrypt/live/api.allcall.com/fullchain.pem
# /etc/letsencrypt/live/api.allcall.com/privkey.pem
```

### 2. Nginx 配置（HTTPS）

**创建 `/opt/allcallall/nginx.conf`**:

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 100M;

    # 启用 gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 10240;
    gzip_types text/plain text/css text/xml text/javascript 
               application/x-javascript application/xml+rss 
               application/javascript application/json;

    # HTTP 重定向到 HTTPS
    server {
        listen 80;
        server_name api.allcall.com allcall.com;
        return 301 https://$server_name$request_uri;
    }

    # HTTPS 服务器
    server {
        listen 443 ssl http2;
        server_name api.allcall.com allcall.com;

        # SSL 证书配置
        ssl_certificate /etc/letsencrypt/live/api.allcall.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/api.allcall.com/privkey.pem;

        # SSL 安全配置
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        # 后端服务代理
        location /api/v1/ {
            proxy_pass http://backend:8080/api/v1/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # WebSocket 代理
        location /api/v1/ws {
            proxy_pass http://backend:8080/api/v1/ws;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 86400;
        }

        location / {
            root /usr/share/nginx/html;
            try_files $uri $uri/ /index.html;
        }
    }
}
```

---

## 防火墙和安全组

### 1. 云平台安全组设置

需要开放的端口：
- **80**: HTTP 流量
- **443**: HTTPS 流量（WebSocket 安全连接）
- **8080**: 后端 API（可选，通常通过 Nginx 代理）
- **3306**: MySQL（仅限内部网络，不对外）
- **6379**: Redis（仅限内部网络，不对外）
- **22**: SSH 管理（限制特定 IP）

#### WebRTC/TURN 相关端口 (可选)

| 端口 | 协议 | 用途 | 开放范围 |
|-----|------|------|---------| 
| 3478 | UDP/TCP | TURN 服务 | 外网 |
| 443 | TCP | TURNS (TLS) | 外网 (可选) |
| 49152-49200 | UDP | TURN 中继端口 | 外网 |

> 📌 如果不运行自托管 TURN 服务器，可不开放这些端口

### 2. UFW 防火墙配置

```bash
# 启用防火墙
sudo ufw enable

# 允许 SSH（防止被锁定）
sudo ufw allow 22/tcp

# 允许 HTTP
sudo ufw allow 80/tcp

# 允许 HTTPS
sudo ufw allow 443/tcp

# 查看规则
sudo ufw status

# 拒绝所有其他传入连接（默认）
sudo ufw default deny incoming
sudo ufw default allow outgoing
```

---

## 域名配置

### 1. 购买域名
- 推荐服务商：Namecheap, GoDaddy, Aliyun 等

### 2. DNS 解析配置

假设你的域名是 `allcall.com`：

| 类型 | 主机 | 值 | TTL |
|------|------|-----|-----|
| A | @ | 81.68.168.207 | 3600 |
| A | api | 81.68.168.207 | 3600 |
| CNAME | www | allcall.com | 3600 |

### 3. 验证 DNS 解析

```bash
nslookup api.allcall.com
dig api.allcall.com
```

---

## 推送通知配置 (FCM)

> ⚠️ **功能状态**: 即将推出 - 后端 FCM 模块已就位，待 Firebase Admin SDK 集成

### 概述

Firebase Cloud Messaging (FCM) 用于在用户离线或应用在后台时发送来电通知。

### 1. Firebase 项目设置

1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 创建新项目或选择现有项目
3. 添加 Android 应用 (包名: `com.allcallall.mobile`)
4. 下载 `google-services.json`

### 2. 后端配置

```bash
# 生成服务账号密钥
# Firebase Console → 项目设置 → 服务账号 → 生成新私钥

# 设置环境变量
export FCM_SERVICE_ACCOUNT_PATH="/opt/allcallall/secrets/firebase-service-account.json"
```

**Docker Compose 配置**:
```yaml
backend:
  environment:
    FCM_SERVICE_ACCOUNT_PATH: ${FCM_SERVICE_ACCOUNT_PATH:-}
  volumes:
    - ./secrets:/opt/allcallall/secrets:ro
```

### 3. 移动端配置

将 `google-services.json` 放置到 `mobile/android/app/`

Token 注册端点: `POST /api/v1/users/fcm-token`

### 4. 验证

```bash
# 查看后端日志
docker compose logs backend | grep -i fcm
```

---

## TURN/TURNS 服务器配置

### 1. 标准 TURN 服务器 (端口 3478)

```bash
docker run -d --network host --name coturn instrumentisto/coturn \
  -a -f -v -n --log-file=stdout \
  --realm=allcallall --user=allcallall:strongpassword \
  --external-ip=$(curl -s ifconfig.me) \
  --min-port=49152 --max-port=49200
```

### 2. TURNS on 443 (企业网络穿透)

适用于仅允许 HTTPS 出站的企业网络。

**使用 Docker Compose**:
```bash
cd infra
docker compose -f docker-compose.turn.yml up -d
```

**证书配置**: 将 TLS 证书放置于 `infra/ssl/`

**ICE 服务器配置**:
```bash
export WEBRTC_ICE_SERVERS_JSON='[
  {"urls":["stun:stun.l.google.com:19302"]},
  {"urls":["turn:turn.example.com:3478"],"username":"user","credential":"pass"},
  {"urls":["turns:turn.example.com:443?transport=tcp"],"username":"user","credential":"pass"}
]'
```

### 3. 移动端配置

```bash
# 启用受限网络模式
EXPO_PUBLIC_RESTRICTED_NETWORK=1
```

---

## 端到端加密 (E2EE)

### 概述

AllCallAll 实现应用层端到端加密，确保通话密钥永不经过服务器。

**技术规格**:
- **密钥交换**: ECDH (P-256 曲线)
- **会话密钥派生**: HKDF-SHA256
- **传输通道**: WebRTC DataChannel (`e2ee-key-exchange`)
- **存储**: 身份密钥使用设备 Keychain 安全存储

> ⚠️ **重要限制**: 由于 `react-native-webrtc` 不支持 Insertable Streams API，
> 本 E2EE 实现用于建立共享密钥和指纹验证，而非媒体帧级加密。
> WebRTC 媒体流仍受 DTLS-SRTP 传输层加密保护。

### 部署注意事项

1. **后端无需配置**: 密钥交换通过点对点 DataChannel 完成
2. **日志安全**: 密钥永不出现在服务器日志中
3. **DataChannel 依赖**: 确保 WebRTC 连接正常建立

### 用户验证

应用界面显示安全指纹，用户可通过带外渠道核对。

### 代码位置

- 密钥生成: `mobile/src/services/e2ee/E2EEService.ts`
- 密钥交换: `mobile/src/services/e2ee/E2EEKeyExchange.ts`
- 集成点: `mobile/src/context/SignalingContext.tsx`

---

## 受限网络部署

### 适用场景

- 企业网络仅允许 HTTPS/443 出站
- 需要通过 HTTP 代理的环境
- WebSocket 被阻断的网络

### 1. 混合信令 (WebSocket + HTTP Long-Poll)

当 WebSocket 被阻断时，客户端可切换到 HTTP 长轮询。

**后端端点** (已实现):
| 端点 | 方法 | 说明 |
|-----|------|------|
| `/api/v1/signaling/send` | POST | 发送信令消息 |
| `/api/v1/signaling/poll?timeout_ms=25000` | GET | 轮询信令消息 |

**移动端配置**:
```bash
# 强制使用 HTTP 长轮询
EXPO_PUBLIC_SIGNALING_TRANSPORT=poll

# 自动模式 (默认)
EXPO_PUBLIC_SIGNALING_TRANSPORT=auto
```

### 2. WebSocket Keepalive

某些代理会断开空闲连接。启用 keepalive:

```bash
EXPO_PUBLIC_SIGNALING_SHAPING=1
```

### 3. 完整受限网络配置

```bash
EXPO_PUBLIC_API_HTTP=https://api.company.com
EXPO_PUBLIC_API_WS=wss://api.company.com
EXPO_PUBLIC_FORCE_TLS=1
EXPO_PUBLIC_RESTRICTED_NETWORK=1
EXPO_PUBLIC_SIGNALING_TRANSPORT=auto
EXPO_PUBLIC_SIGNALING_SHAPING=1
```

---

## 性能优化

### 1. 数据库优化

```sql
-- MySQL 优化参数
SET GLOBAL max_connections = 1000;
SET GLOBAL innodb_buffer_pool_size = 2147483648; -- 2GB

-- 添加常用查询索引
CREATE INDEX idx_user_email ON users(email);
CREATE INDEX idx_room_code ON rooms(room_code);
```

### 2. Redis 优化

```bash
# 编辑 redis.conf
sudo nano /opt/allcallall/redis.conf

# 添加内存优化
maxmemory 2gb
maxmemory-policy allkeys-lru
```

### 3. Nginx 优化

```nginx
# 增加 worker 连接数
events {
    worker_connections 4096;
}

# 启用 HTTP/2
listen 443 ssl http2;

# 启用 keepalive
keepalive_timeout 65;
```

---

## 故障排查

### 常见问题

#### 1. WebSocket 连接失败（403/401）
```bash
# 检查后端日志
docker compose logs backend | grep -i websocket

# 检查 token 有效性
curl -H "Authorization: Bearer your_token" http://localhost:8080/api/v1/users/me
```

#### 2. 数据库连接错误
```bash
# 进入 MySQL 容器
docker compose exec mysql mysql -uroot -prootpass

# 检查用户和权限
SHOW GRANTS FOR 'allcallall'@'%';
```

#### 3. Redis 连接问题
```bash
# 测试 Redis
docker compose exec redis redis-cli ping

# 检查内存
docker compose exec redis redis-cli INFO memory
```

#### 4. HTTPS 证书错误
```bash
# 查看证书有效期
openssl x509 -in /etc/letsencrypt/live/api.allcall.com/fullchain.pem -text -noout

# 自动续期设置
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

---

## 监控和日志

### 1. 查看服务状态

```bash
# 查看所有服务
docker compose ps

# 查看容器资源使用
docker stats

# 查看日志
docker compose logs -f backend --tail=100
```

### 2. 设置日志聚合

考虑使用 ELK Stack、Grafana 等监控工具。

### 3. 性能监控

```bash
# 监控服务器资源
htop

# 监控网络
nethogs

# 监控磁盘
df -h
du -sh /opt/allcallall
```

---

## 安全建议

1. **定期更新依赖**
   ```bash
   docker compose pull
   docker compose up -d
   ```

2. **备份数据库**
   ```bash
   docker compose exec mysql mysqldump -uroot -prootpass allcallall_db > backup.sql
   ```

3. **使用防火墙限制访问**
   - 仅允许必要的端口
   - 定期审计日志

4. **启用 SSL/TLS**
   - 所有流量都应通过 HTTPS
   - WebSocket 使用 wss://

5. **保护敏感信息**
   - 使用 .env 文件管理密钥
   - 不要提交密钥到 Git

---

## 部署检查清单

- [ ] 云服务器已准备（Ubuntu 20.04+）
- [ ] Docker 和 Docker Compose 已安装
- [ ] 项目代码已克隆到 `/opt/allcallall`
- [ ] 生产环境配置文件已创建
- [ ] .env 文件已配置（所有密钥已更改）
- [ ] MySQL 和 Redis 正常运行
- [ ] 后端服务正常运行
- [ ] Nginx 反向代理已配置
- [ ] HTTPS 证书已安装
- [ ] 防火墙规则已配置
- [ ] 域名 DNS 已解析
- [ ] 移动应用配置已更新为公网地址
- [ ] 应用已部署并测试

---

## 命令速查

### 后端部署（首次 + 后续更新）

首次部署（推荐）

```bash
# 登录服务器（Ubuntu）
ssh ubuntu@<SERVER_IP>

# 准备代码目录
sudo apt update && sudo apt install -y git
sudo mkdir -p /opt/allcallall
sudo chown -R $USER:$USER /opt/allcallall

# 拉代码（main）
git clone https://github.com/XianingY/AllCallAll.git /opt/allcallall
cd /opt/allcallall
git checkout main
```

跑部署准备脚本（会装 Docker、生成 .env、配防火墙）

```bash
# 有域名
bash /opt/allcallall/scripts/deployment/deploy-cloud.sh <SERVER_IP> <DOMAIN> /opt/allcallall https://github.com/XianingY/AllCallAll.git

# 没域名（第二个参数留空）
bash /opt/allcallall/scripts/deployment/deploy-cloud.sh <SERVER_IP> "" /opt/allcallall https://github.com/XianingY/AllCallAll.git
```

修改生产环境变量（至少改邮箱授权码）

```bash
nano /opt/allcallall/.env
```

重点看：`MAIL_PASSWORD`（必填），`JWT_SECRET` / `MYSQL_PASSWORD` / `REDIS_PASSWORD`（脚本会自动生成，建议保留或自行替换）。

启动生产栈

```bash
cd /opt/allcallall/infra
docker compose -f docker-compose.production.yml up -d --build
```

验证服务

```bash
# 容器状态
docker compose -f /opt/allcallall/infra/docker-compose.production.yml ps

# 后端日志
docker compose -f /opt/allcallall/infra/docker-compose.production.yml logs -f backend

# 健康检查（公网经过 Nginx）
curl -f http://<SERVER_IP>/api/v1/health
```

后续更新上线（每次）

```bash
cd /opt/allcallall
git checkout main
git pull --ff-only origin main
cd /opt/allcallall/infra
docker compose -f docker-compose.production.yml up -d --build
```

注意两点：

- 云厂商安全组也要放行 `22/80/443`（不仅是 UFW）。
- 当前 `docker-compose.production.yml` 虽映射了 `443`，但 `nginx.conf` 默认只监听 `80`；先用 HTTP 验证成功，再单独做 HTTPS 配置。

### Docker Compose 常用命令

```bash
# 查看所有服务状态
docker compose ps

# 查看服务日志（最后 50 行）
docker compose logs backend --tail=50

# 实时监控日志
docker compose logs -f backend

# 重启单个服务
docker compose restart backend

# 重启所有服务
docker compose restart

# 进入容器
docker compose exec backend bash

# 查看环境变量
docker compose config | grep -A 20 "backend:"

# 停止所有服务
docker compose down

# 停止并删除数据（慎用）
docker compose down -v
```

### ADB 调试命令

```bash
# 查看连接的设备
adb devices

# 查看日志
adb logcat | grep allcallall

# 安装 APK
adb install -r app.apk

# 卸载应用
adb uninstall com.allcallall.mobile

# 启动应用
adb shell am start -n com.allcallall.mobile/.MainActivity

# 测试网络连接
adb shell ping 81.68.168.207
```

### 数据库备份

```bash
# 备份 MySQL
docker compose exec mysql mysqldump -uroot -prootpass allcallall_db > backup.sql

# 恢复 MySQL
docker compose exec -T mysql mysql -uroot -prootpass allcallall_db < backup.sql

# 备份 Redis
docker compose exec redis redis-cli --rdb /data/dump.rdb
```

### 故障排查

```bash
# 检查 ADB 反向转发
adb reverse --list

# 重启 adb 服务
adb kill-server && adb start-server

# 测试后端 API
curl -v http://localhost:8080/api/v1/health

# 查看防火墙状态
sudo ufw status

# 检查证书有效期
openssl x509 -in /etc/letsencrypt/live/api.allcall.com/fullchain.pem -text -noout | grep "Not"

# 手动续期证书
sudo certbot renew --force-renewal
```
