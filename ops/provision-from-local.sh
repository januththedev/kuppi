#!/usr/bin/env bash
# Path B provisioning: the VM already exists (created in the OCI console), and
# you have its IP. Pushes ops/vm-bootstrap.sh over SSH, runs it, pulls back the
# app credentials, then smoke-tests the endpoint — all from this machine.
#
#   ops/provision-from-local.sh 129.153.1.2                 # user defaults to ubuntu
#   MINIO_DOMAIN=minio.example.com ops/provision-from-local.sh HOST USER
set -euo pipefail

HOST="${1:?Usage: ops/provision-from-local.sh HOST [USER]}"
USER="${2:-ubuntu}"
SSH="ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes"
SCP="scp -o StrictHostKeyChecking=accept-new"
cd "$(dirname "$0")/.."

echo ">> pushing bootstrap script"
$SCP vm-bootstrap.sh "$USER@$HOST:/tmp/"

echo ">> running bootstrap on $HOST (3-4 min; certificate issuance can take longer)"
$SSH "$USER@$HOST" \
  "MINIO_DOMAIN='${MINIO_DOMAIN:-}' sudo -E bash /tmp/vm-bootstrap.sh"

echo ">> pulling app credentials into ./.kuppi-s3-credentials.env (git-ignored)"
$SSH "$USER@$HOST" "sudo cat /root/kuppi-s3-credentials.env" > .kuppi-s3-credentials.env
chmod 600 .kuppi-s3-credentials.env

echo ">> smoke test against the new endpoint"
node ops/smoke-test.mjs .kuppi-s3-credentials.env

cat <<EOF

Done. Next steps:
  1. Copy the S3_* values from .kuppi-s3-credentials.env into Vercel env vars.
  2. Redeploy, then run: node ops/migrate-vercel-blob.mjs   (see ops/README.md)
EOF
