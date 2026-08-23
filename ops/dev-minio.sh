#!/usr/bin/env bash
# Local dev MinIO with the same shape as production (CORS wildcard, public-read
# bucket). Idempotent: re-runs recreate the container but keep the named volume.
#
#   ops/dev-minio.sh                    # defaults below
#   MINIO_ROOT_PASSWORD=... ops/dev-minio.sh
#
# After it starts, run the app against it with:
#   S3_ENDPOINT=http://localhost:9000 S3_BUCKET=kuppi-uploads \
#   S3_ACCESS_KEY_ID=kuppi-admin S3_SECRET_ACCESS_KEY=kuppi-local-secret pnpm dev
set -euo pipefail

ROOT_USER="${MINIO_ROOT_USER:-kuppi-admin}"
ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-kuppi-local-secret}"

docker rm -f kuppi-minio >/dev/null 2>&1 || true
docker run -d --name kuppi-minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER="$ROOT_USER" \
  -e MINIO_ROOT_PASSWORD="$ROOT_PASSWORD" \
  -e MINIO_API_CORS_ALLOW_ORIGIN="*" \
  -v kuppi-minio-data:/data \
  quay.io/minio/minio server /data --console-address ":9001" >/dev/null

for i in $(seq 1 30); do
  curl -fsS http://localhost:9000/minio/health/live >/dev/null 2>&1 && break
  [ "$i" = 30 ] && { echo "MinIO did not start — docker logs kuppi-minio" >&2; exit 1; }
  sleep 1
done

docker exec kuppi-minio sh -c \
  'mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc mb --ignore-existing local/kuppi-uploads >/dev/null && mc anonymous set download local/kuppi-uploads >/dev/null'

cat <<'EOF'
Local MinIO ready
  API      http://localhost:9000   (S3_ENDPOINT for local runs)
  Console  http://localhost:9001
  Creds    kuppi-admin / kuppi-local-secret
Verify anytime: S3_ENDPOINT=http://localhost:9000 S3_ACCESS_KEY_ID=kuppi-admin \
  S3_SECRET_ACCESS_KEY=kuppi-local-secret node ops/smoke-test.mjs
EOF
