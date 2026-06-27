# Deployment Guide

This guide describes the deployable shapes that exist today. AllCallAll is maintained as a backend/AI Agent portfolio project, so the goal is reproducible local/staging infrastructure rather than a full commercial production platform.

## Supported Topologies

### 1. Local API With Embedded Workers

```bash
./scripts/development/start-services.sh

cd backend
CONFIG_PATH=./configs/config.yaml go run ./cmd/server
```

Use this for normal local development. The API process starts embedded workers by default.

### 2. API Plus Standalone Workers

```bash
EMBEDDED_WORKERS=0 make run-api
make run-agent-worker
make run-outbox-worker
make run-cleanup-worker
```

Use this to show the modular-monolith-to-worker split without requiring Kafka or Elasticsearch.

### 3. Interview Infra Profile

```bash
docker compose -f infra/docker-compose.yml \
  --profile microservices \
  --profile interview-infra \
  up api user-service outbox-worker data-worker search-worker kafka elasticsearch
```

This topology demonstrates gRPC auth validation, Kafka-compatible settlement, Elasticsearch search, and standalone workers. Kubernetes is intentionally not implemented.

### 4. Single-node Beta Stack

The maintained Beta shape serves the Expo Web export and API through TLS Nginx, runs a one-shot schema migration, persists MySQL/Redis/recordings, and exposes Coturn:

```bash
docker compose --env-file .env -f infra/docker-compose.production.yml config
docker compose --env-file .env -f infra/docker-compose.production.yml up -d --build
curl --cacert infra/ssl/fullchain.pem https://localhost/api/v1/ready
```

Provide `infra/ssl/fullchain.pem` and `infra/ssl/privkey.pem`. Set `TURN_HOST`, `TURN_REALM`, `TURN_USERNAME`, and `TURN_PASSWORD` to public values reachable by clients. This topology is intentionally limited to one media node and rooms of at most six participants.

## Runtime Components

| Component | Entrypoint | Responsibility |
| --- | --- | --- |
| API server | `backend/cmd/server` | HTTP APIs, WebSocket endpoints, signaling, embedded workers by default. |
| User Service | `backend/cmd/user-service` | gRPC token validation and user lookup. |
| Agent Worker | `backend/cmd/agent-worker` | Agent run and workflow processing. |
| Outbox Worker | `backend/cmd/outbox-worker` | Collaboration delivery, knowledge ingest/index events, transcription jobs, optional Kafka bridge. |
| Data Worker | `backend/cmd/data-worker` | Kafka settlement consumer, writes `room_settlements`. |
| Search Worker | `backend/cmd/search-worker` | Indexes messages into Elasticsearch. |
| Cleanup Worker | `backend/cmd/cleanup-worker` | Refresh-session and recording retention cleanup. |

## Required Services

- MySQL 8-compatible database.
- Redis 7-compatible cache/realtime dependency.

Optional services:

- S3-compatible object storage for recordings.
- Firebase Admin SDK service account for FCM.
- Kafka-compatible broker for settlement demo.
- Elasticsearch for search and chunk indexing.

## Environment Checklist

Core:

```bash
CONFIG_PATH=/app/configs/config.yaml
DB_DSN='allcallall:${MYSQL_PASSWORD}@tcp(mysql:3306)/allcallall_db?parseTime=true&charset=utf8mb4&loc=Local'
REDIS_ADDR=redis:6379
REDIS_PASSWORD=...
JWT_SECRET=...
MAIL_PASSWORD=...
CORS_ALLOWED_ORIGINS=https://app.example.com
```

Workers:

```bash
EMBEDDED_WORKERS=0
WORKER_ID=outbox-worker-1
OUTBOX_WORKER_INTERVAL_SEC=1
OUTBOX_WORKER_BATCH_SIZE=50
```

Recording and transcription:

```bash
RECORDING_STORAGE_DRIVER=local
RECORDING_STORAGE_DIR=/tmp/allcallall-recordings
TRANSCRIPTION_ENABLED=true
TRANSCRIPTION_PROVIDER=openai_compatible
TRANSCRIPTION_OPENAI_BASE_URL=https://api.example.com/v1
TRANSCRIPTION_OPENAI_MODEL=whisper-1
TRANSCRIPTION_OPENAI_API_KEY=...
TRANSCRIPTION_CHUNK_SECONDS=600
TRANSCRIPTION_MAX_UPLOAD_BYTES=25165824
```

S3-compatible recording storage:

```bash
RECORDING_STORAGE_DRIVER=s3
RECORDING_S3_BUCKET=allcallall-recordings
RECORDING_S3_REGION=us-east-1
RECORDING_S3_ENDPOINT=https://s3.example.com
RECORDING_S3_ACCESS_KEY_ID=...
RECORDING_S3_SECRET_ACCESS_KEY=...
RECORDING_S3_FORCE_PATH_STYLE=1
```

gRPC/Kafka/Elasticsearch:

```bash
USER_GRPC_ADDR=:9090
USER_SERVICE_GRPC_ADDR=user-service:9090
KAFKA_BROKERS=kafka:9092
KAFKA_SETTLEMENT_TOPIC=allcallall.room.settlements
KAFKA_CONSUMER_GROUP=allcallall-data-worker
ELASTICSEARCH_URL=http://elasticsearch:9200
ELASTICSEARCH_INDEX=allcallall_messages
```

## Deployment Checklist

- Build succeeds: `cd backend && go build ./...`.
- Tests pass: `cd backend && go test ./...`.
- Vet passes: `cd backend && go vet ./...`.
- Required secrets are injected by runtime environment, not committed.
- `X-Request-ID` is generated or propagated by the edge/proxy.
- Public CORS origins are explicit.
- `/api/v1/chat/ws`, `/api/v1/ws`, and `/api/v1/signaling/*` have proxy timeouts suitable for realtime use.
- Recording download paths are always authorized through the backend.
- FCM, S3, Kafka, Elasticsearch, SMTP, and JWT secrets are never logged.
- Optional Kafka/Elasticsearch demos are either verified or clearly marked disabled.
- `docker compose ... run --rm migrate` succeeds before the API is started; `DB_AUTO_MIGRATE=0` in Beta/production.
- `/api/v1/health` reports process liveness and `/api/v1/ready` reports MySQL/Redis readiness.
- `AGENT_PROVIDER_STRICT=true` and a real transcription provider are configured; mock/rules output is not presented as Beta output.

## Web / Android / Desktop Checks

```bash
cd mobile && npm run test:unit && npx tsc --noEmit && npm run lint
cd mobile && npx expo export --platform web
cd desktop && npm run check && npm run build
```

Manual smoke:

- Login/register.
- Open Meetings.
- Join and leave a room.
- Start/stop a recording.
- Check recording card status: processing, ready, failed, or no transcript.
- Run an Agent on the conversation and verify meeting transcript context is available when transcription succeeded.

## Scope Boundaries

- Kubernetes is out of scope.
- The Beta supports OpenAI-compatible recording transcription and local/S3 recording reads. Real provider smoke tests require externally supplied credentials.
- Web billing and Web push are intentionally not implemented.

## Backup And Restore

MySQL:

```bash
docker compose --env-file .env -f infra/docker-compose.production.yml exec -T mysql \
  mysqldump -uallcallall -p"$MYSQL_PASSWORD" --single-transaction allcallall_db > allcallall.sql
cat allcallall.sql | docker compose --env-file .env -f infra/docker-compose.production.yml exec -T mysql \
  mysql -uallcallall -p"$MYSQL_PASSWORD" allcallall_db
```

Local recordings are stored in the `recording_data` volume. Stop the backend before archiving or restoring that volume so files and database metadata remain consistent. For S3, use bucket versioning and the object-store provider's replication/backup policy. Redis contains transient realtime/cache state; persist its volume for operational continuity, but restore MySQL and recordings as the authoritative data pair.
