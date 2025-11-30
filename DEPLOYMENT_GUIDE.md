# AllCallAll 云服务器部署指南

## 目录
1. [环境准备](#环境准备)
2. [后端服务部署](#后端服务部署)
3. [移动应用配置](#移动应用配置)
4. [HTTPS/SSL 配置](#httpssl-配置)
5. [防火墙和安全组](#防火墙和安全组)
6. [域名配置](#域名配置)
7. [性能优化](#性能优化)
8. [故障排查](#故障排查)

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

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证安装
docker --version
docker-compose --version
```

### 3. 克隆项目代码
```bash
cd /opt
sudo mkdir -p /opt/allcall
sudo chown -R $USER:$USER /opt/allcall
cd /opt/allcall
git clone https://github.com/yourusername/allcall.git .
```

---

## 后端服务部署

### 1. 配置文件准备

#### 创建生产环境配置
```bash
# 编辑配置文件
sudo nano /opt/allcall/backend/configs/config.production.yaml
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
  secret: "your-secure-jwt-secret-here-change-it"
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
# /opt/allcall/.env
MAIL_PASSWORD=your_qq_email_auth_code
JWT_SECRET=your-secure-jwt-secret-here-change-it
MYSQL_ROOT_PASSWORD=strong_root_password_change_this
MYSQL_PASSWORD=strong_db_password_change_this
APP_ENV=production
```

### 3. 修改 docker-compose.yml

```yaml
# /opt/allcall/infra/docker-compose.yml
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
      - allcall_network

  redis:
    image: redis:7.2
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: ["redis-server", "--save", "60", "1", "--loglevel", "warning", "--requirepass", "${REDIS_PASSWORD}"]
    restart: unless-stopped
    networks:
      - allcall_network

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
      - allcall_network
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
      - allcall_network

volumes:
  mysql_data:
  redis_data:

networks:
  allcall_network:
    driver: bridge
```

### 4. 启动服务

```bash
cd /opt/allcall/infra
docker-compose up -d

# 查看启动状态
docker-compose ps

# 查看日志
docker-compose logs -f backend

# 测试后端
curl http://81.68.168.207:8080/api/v1/users/me
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

**创建 `/opt/allcall/nginx.conf`**:

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
sudo nano /opt/allcall/redis.conf

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
docker-compose logs backend | grep -i websocket

# 检查 token 有效性
curl -H "Authorization: Bearer your_token" http://localhost:8080/api/v1/users/me
```

#### 2. 数据库连接错误
```bash
# 进入 MySQL 容器
docker-compose exec mysql mysql -uroot -prootpass

# 检查用户和权限
SHOW GRANTS FOR 'allcallall'@'%';
```

#### 3. Redis 连接问题
```bash
# 测试 Redis
docker-compose exec redis redis-cli ping

# 检查内存
docker-compose exec redis redis-cli INFO memory
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
docker-compose ps

# 查看容器资源使用
docker stats

# 查看日志
docker-compose logs -f backend --tail=100
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
du -sh /opt/allcall
```

---

## 安全建议

1. **定期更新依赖**
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

2. **备份数据库**
   ```bash
   docker-compose exec mysql mysqldump -uroot -prootpass allcallall_db > backup.sql
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
- [ ] 项目代码已克隆到 `/opt/allcall`
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

