# AllCallAll 公网部署指南（使用 Cloudflare Tunnel）

本指南用于将 AllCallAll 应用部署到公网，使得不同局域网下的用户可以进行音视频通话。

## 概述

```
┌─────────────────────────────────────────────────────────────┐
│                     移动应用用户                              │
│  (不同局域网/网络环境)                                       │
└────────────┬────────────────────────────────────────────────┘
             │
             │ HTTPS/WSS
             ▼
┌─────────────────────────────────────────────────────────────┐
│               Cloudflare Tunnel 公网域名                      │
│            (例: api.allcallall.example.com)                  │
└────────────┬────────────────────────────────────────────────┘
             │
             │ cloudflared 代理
             ▼
┌─────────────────────────────────────────────────────────────┐
│              云服务器 / 本地服务器                            │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Go后端服务   │  │   MySQL      │  │    Redis     │      │
│  │ :8080        │  │   :3306      │  │   :6379      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  信令服务: WebSocket (内置)                                 │
│  WebRTC媒体: P2P (直连)                                     │
└──────────────────────────────────────────────────────────────┘
```

---

## 第一部分：服务器端部署

### 1. 云服务器准备

**推荐配置：**
- 操作系统: Ubuntu 22.04 LTS 或 CentOS 7+
- CPU: 2核
- 内存: 2GB+
- 存储: 20GB+
- 网络: 允许出站访问（用于 Cloudflare Tunnel）

**必要软件：**
```bash
# 安装 Docker 和 Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 安装 Cloudflare 命令行工具
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# 安装 Git
sudo apt-get install -y git
```

---

### 2. 部署 AllCallAll 后端服务

#### 2.1 克隆项目到服务器
```bash
cd /opt
sudo git clone https://github.com/XianingY/AllCallAll.git
cd AllCallAll
```

#### 2.2 使用生产环境配置启动服务
```bash
cd infra

# 创建 .env.production 文件
cat > .env.production << 'EOF'
MYSQL_ROOT_PASSWORD=your_secure_password
MYSQL_PASSWORD=your_secure_password
REDIS_PASSWORD=your_secure_password
JWT_SECRET=your_generated_jwt_secret
EOF

# 使用生产配置启动容器
docker-compose -f docker-compose.production.yml up -d

# 检查服务状态
docker-compose -f docker-compose.production.yml ps
docker-compose -f docker-compose.production.yml logs backend
```

#### 2.3 验证后端服务
```bash
# 测试 API 连通性
curl -X GET http://localhost:8080/health
```

---

### 3. 使用 Cloudflare Tunnel 暴露服务

#### 3.1 配置 Cloudflare 账户

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 左侧菜单 → **访问** → **Tunnel**
3. 点击 **创建隧道**
4. 选择隧道类型：**Cloudflared**
5. 输入隧道名称：`allcallall-tunnel`

#### 3.2 在服务器上安装和配置 cloudflared

```bash
# 创建 cloudflared 配置目录
sudo mkdir -p /etc/cloudflared

# 复制配置文件（从项目目录）
sudo cp /opt/AllCallAll/infra/cloudflared-config.yml /etc/cloudflared/config.yml

# 从 Cloudflare Dashboard 获取 credentials.json，保存到：
sudo cp ~/Downloads/credentials.json /etc/cloudflared/credentials.json
sudo chmod 600 /etc/cloudflared/credentials.json
```

#### 3.3 启动 Cloudflare Tunnel

**使用 systemd 服务（推荐生产环境）**
```bash
# 创建 systemd 服务
sudo tee /etc/systemd/system/cloudflared.service > /dev/null << 'EOF'
[Unit]
Description=Cloudflare Tunnel
After=network.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/bin/cloudflared tunnel run --config /etc/cloudflared/config.yml
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# 启动服务
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
sudo systemctl status cloudflared

# 查看日志
sudo journalctl -u cloudflared -f
```

#### 3.4 配置 DNS 记录

在 Cloudflare 域名管理中添加 DNS 记录：

| 类型 | 名称 | 目标 |
|------|------|------|
| CNAME | api | allcallall-tunnel.cfargotunnel.com |

或让 Cloudflare 自动生成子域名（`xxx.cfargotunnel.com`）。

---

## 第二部分：移动应用配置

### 1. 修改后端连接地址

编辑 `mobile/src/config/index.ts`：

```typescript
import { PRODUCTION_CONFIG } from './production';

// 根据环境选择
const config = __DEV__ 
  ? { BASE_URL: `http://${LAN_IP}:8080`, WS_URL: `ws://${LAN_IP}:8080/ws` }
  : PRODUCTION_CONFIG;

export default config;
```

### 2. 配置 HTTPS 证书验证

在生产环境中必须启用证书验证：

```typescript
// src/api/client.ts
import axios from 'axios';

const apiClient = axios.create({
  baseURL: config.BASE_URL,
  httpsAgent: {
    rejectUnauthorized: true,
  },
});
```

### 3. 打包并发布

```bash
cd mobile

# 生产构建（iOS）
eas build --platform ios --auto-submit

# 生产构建（Android）
eas build --platform android --auto-submit
```

---

## 第三部分：生产环境优化

### 1. 数据库备份策略

```bash
# 备份脚本
mkdir -p /opt/backups
docker exec infra-mysql-1 mysqldump -u allcallall \
  -p${MYSQL_PASSWORD} allcallall_db \
  | gzip > /opt/backups/allcallall_db_$(date +%Y%m%d_%H%M%S).sql.gz

# 定时任务 (crontab -e)
0 2 * * * /opt/AllCallAll/scripts/backup.sh
```

### 2. 日志管理

```yaml
# docker-compose.production.yml 已配置
logging:
  driver: "json-file"
  options:
    max-size: "100m"
    max-file: "10"
```

### 3. 监控和告警

```bash
# 健康检查
curl -f https://api.allcallall.example.com/health || \
  echo "Service down" | mail -s "AllCallAll Alert" admin@example.com
```

---

## 第四部分：故障排查

### 问题 1：移动应用无法连接后端

**检查清单：**
```bash
# 1. 检查 Cloudflare Tunnel 状态
sudo systemctl status cloudflared

# 2. 测试公网连接
curl -I https://api.allcallall.example.com

# 3. 查看后端日志
docker-compose -f docker-compose.production.yml logs -f backend

# 4. 检查网络延迟
ping api.allcallall.example.com
```

### 问题 2：WebSocket 连接超时

**原因和解决：**
- ISP 阻止 WebSocket → 使用 HTTP 长轮询备选方案
- 防火墙规则 → 检查云服务器的安全组
- Cloudflare 限制 → 升级到付费计划

### 问题 3：音视频质量差

**优化步骤：**
1. 检查网络带宽
2. 增加 TURN 服务器以绕过 NAT
3. 调整 WebRTC 编码参数

---

## 第五部分：安全最佳实践

### 1. 环境变量管理

```bash
# .env.production（不要提交到 Git）
MYSQL_ROOT_PASSWORD=secure_root_password
MYSQL_PASSWORD=secure_user_password
JWT_SECRET=long_random_secret_key
REDIS_PASSWORD=secure_redis_password
```

### 2. 身份验证强化

```go
// backend/configs/config.yaml
auth:
  jwt_expiry_hours: 24
  refresh_token_expiry_days: 7
```

### 3. CORS 配置

```go
// backend/internal/server/routes.go
config := cors.DefaultConfig()
config.AllowOrigins = []string{
  "https://mobile.allcallall.example.com",
}
config.AllowCredentials = true
engine.Use(cors.New(config))
```

---

## 部署检查清单

- [ ] 云服务器已创建并运行
- [ ] Docker 和 Docker Compose 已安装
- [ ] Cloudflare 账户已创建，隧道已配置
- [ ] 后端服务容器运行正常
- [ ] Cloudflare Tunnel 已连接
- [ ] HTTPS/WSS 连接可用
- [ ] 移动应用已更新后端地址
- [ ] 生产环境密钥已更改
- [ ] 备份脚本已配置
- [ ] 监控告警已设置

---

## 成本估算

| 项目 | 月度成本 |
|------|---------|
| Cloudflare Tunnel（免费） | $0 |
| VPS（2核2G） | $5-15 |
| 域名（可选） | $10-15 |
| **总计** | **$15-30** |

---

## 获取帮助

遇到问题时：
1. 查看 Cloudflare 仪表板的隧道日志
2. 检查服务器的系统日志：`journalctl -n 100`
3. 查看容器日志：`docker-compose logs -f`
4. 在 AllCallAll GitHub 仓库提交 Issue
