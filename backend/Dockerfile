FROM golang:1.22-alpine AS build

WORKDIR /src

# Install build dependencies
RUN apk add --no-cache bash build-base git

COPY go.mod go.sum* ./
RUN if [ -f go.mod ]; then go mod download; fi

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/server ./cmd/server

FROM alpine:3.18

WORKDIR /app

COPY --from=build /out/server ./server
COPY configs ./configs

ENV CONFIG_PATH=/app/configs/config.yaml
ENV HTTP_PORT=8080

EXPOSE 8080

ENTRYPOINT ["/app/server"]
