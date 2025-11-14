#!/bin/bash

# AllCall 项目启动脚本
# Usage: ./start.sh

set -e

echo "🚀 Starting AllCall Project..."

# 设置 Go 代理
export GOPROXY=https://goproxy.cn,direct
echo "✅ Go proxy set to: $GOPROXY"

# 进入 infra 目录并启动服务
cd "$(dirname "$0")/infra"
echo "📦 Starting Docker services (MySQL, Redis, Backend)..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 5

echo ""
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "✅ AllCall is starting!"
echo ""
echo "📝 Useful commands:"
echo "  - View logs:        docker-compose logs -f"
echo "  - View backend logs: docker-compose logs -f backend"
echo "  - Stop services:    docker-compose down"
echo "  - Service status:   docker-compose ps"
echo ""
echo "🌐 Services:"
echo "  - Backend API: http://localhost:8080"
echo "  - Health check: http://localhost:8080/ping"
echo ""
