#!/usr/bin/env bash
# Kuppi VM bootstrap — installs and hardens MinIO + Caddy on an Ubuntu VM
# (Oracle Always-Free ARM, but works on any amd64/arm64 Ubuntu box).
#
# Idempotent: safe to re-run over SSH or via cloud-init.
#
# Inputs (env or defaults):
#   MINIO_ROOT_USER      default: kuppi-root        (generated & saved if empty)
#   MINIO_ROOT_PASSWORD  default: generated         (>= 8 chars required by MinIO)
#   MINIO_DOMAIN         default: <public-ip>.sslip.io automatic-TLS domain
#   KUPPI_BUCKET         default: kuppi-uploads
#
# Outputs:
#   /root/kuppi-s3-credentials.env   app credentials for the Kuppi deployment
#   /var/log/kuppi-bootstrap.log     this script's own log when run by cloud-init
set -euo pipefail

MINIO_ROOT_USER="${MINIO_ROOT_USER:-kuppi-root}"
KUPPI_BUCKET="${KUPPI_BUCKET:-kuppi-uploads}"
ARCH="$(uname -m)"
case "$ARCH" in
  aarch64) MC_ARCH="linux-arm64" ;;
  x86_64) MC_ARCH="linux-amd64" ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

log() { echo "[kuppi-bootstrap] $*"; }

# ---------------------------------------------------------------------------
# 0. Resolve/generate secrets and the public domain
# ---------------------------------------------------------------------------
if [ -f /etc/default/minio ] && grep -q '^MINIO_ROOT_PASSWORD=' /etc/default/minio && [ -z "${MINIO_ROOT_PASSWORD:-}" ]; then
  # Re-run: reuse the existing root secret instead of rotating it silently.
  MINIO_ROOT_PASSWORD="$(grep '^MINIO_ROOT_PASSWORD=' /etc/default/minio | cut -d= -f2-)"
else
  MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-$(openssl rand -hex 16)}"
fi

if [ -z "${MINIO_DOMAIN:-}" ]; then
  log "No MINIO_DOMAIN given; deriving <ip>.sslip.io from public IP"
  PUBLIC_IP="$(curl -fsS -m 8 -H 'Authorization: Bearer Oracle' http://169.254.169.254/opc/v2/instance/ 2>/dev/null | grep -o '"publicIp": *"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  [ -n "$PUBLIC_IP" ] || PUBLIC_IP="$(curl -fsS -m 8 https://api.ipify.org)"
  MINIO_DOMAIN="${PUBLIC_IP//./-}.sslip.io"
fi
log "MinIO will be served at https://${MINIO_DOMAIN}"

# The official .deb does NOT create the service account — do it here.
if ! id -u minio-user >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /opt/minio --shell /usr/sbin/nologin minio-user
fi
mkdir -p /opt/minio/data
chown -R minio-user:minio-user /opt/minio

# ---------------------------------------------------------------------------
# 1. MinIO server — single static binary + our own systemd unit, identical on
#    Debian/Ubuntu and RHEL-family/Oracle Linux
# ---------------------------------------------------------------------------
log "Installing MinIO server (${MC_ARCH})"
wget -qO /usr/local/bin/minio "https://dl.min.io/server/minio/release/${MC_ARCH}/minio"
chmod +x /usr/local/bin/minio
chown minio-user:minio-user /opt/minio/data

cat >/etc/default/minio <<EOF
# Managed by Kuppi ops/vm-bootstrap.sh
MINIO_ROOT_USER=${MINIO_ROOT_USER}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
MINIO_VOLUMES="/opt/minio/data"
# API binds loopback only — Caddy terminates TLS on 443. Console loopback too;
# reach it through an SSH tunnel: ssh -L 9001:127.0.0.1:9001 <vm>
MINIO_OPTS="--address 127.0.0.1:9000 --console-address 127.0.0.1:9001"
MINIO_API_CORS_ALLOW_ORIGIN="*"
EOF
chmod 640 /etc/default/minio

cat >/etc/systemd/system/minio.service <<'EOF'
[Unit]
Description=MinIO
Documentation=https://min.io/docs/minio/linux/index.html
Wants=network-online.target
After=network-online.target
AssertFileIsExecutable=/usr/local/bin/minio

[Service]
Type=notify
WorkingDirectory=/usr/local
User=minio-user
Group=minio-user
ProtectProc=invisible
EnvironmentFile=-/etc/default/minio
ExecStart=/usr/local/bin/minio server $MINIO_OPTS $MINIO_VOLUMES
Restart=always
LimitNOFILE=1048576
MemoryAccounting=no
TasksMax=infinity
TimeoutSec=infinity
OOMScoreAdjust=-1000

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload >/dev/null 2>&1 || true

systemctl enable --now minio >/dev/null 2>&1 || systemctl restart minio
for i in $(seq 1 30); do
  curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1 && break
  [ "$i" = 30 ] && { echo "MinIO did not become healthy" >&2; journalctl -u minio --no-pager | tail -20 >&2; exit 1; }
  sleep 1
done
log "MinIO healthy on 127.0.0.1:9000"

# ---------------------------------------------------------------------------
# 2. MinIO client + bucket + least-privilege app user
# ---------------------------------------------------------------------------
log "Installing mc and configuring bucket '${KUPPI_BUCKET}'"
wget -qO /usr/local/bin/mc "https://dl.min.io/client/mc/release/${MC_ARCH}/mc"
chmod +x /usr/local/bin/mc
mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
mc mb --ignore-existing "local/${KUPPI_BUCKET}" >/dev/null
# Public read mirrors today's Vercel Blob access="public" semantics: stored
# resource URLs are permanent and rendered directly by browsers.
mc anonymous set download "local/${KUPPI_BUCKET}" >/dev/null

# Recreate the app user on every run: MinIO never reveals stored secrets, so
# deterministic rotation beats trying to recover the old one. If this script
# re-runs, the deployment's S3_SECRET_ACCESS_KEY must be refreshed from
# /root/kuppi-s3-credentials.env.
mc admin user remove local kuppi-app >/dev/null 2>&1 || true
APP_SECRET="$(openssl rand -hex 24)"
mc admin user add local kuppi-app "$APP_SECRET" >/dev/null
cat >/tmp/kuppi-app-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], "Resource": ["arn:aws:s3:::${KUPPI_BUCKET}/*"] },
    { "Effect": "Allow", "Action": ["s3:ListBucket", "s3:GetBucketLocation"], "Resource": ["arn:aws:s3:::${KUPPI_BUCKET}"] }
  ]
}
EOF
mc admin policy create local kuppi-app-policy /tmp/kuppi-app-policy.json >/dev/null 2>&1 \
  || mc admin policy add local kuppi-app-policy /tmp/kuppi-app-policy.json >/dev/null
mc admin policy attach local kuppi-app-policy --user kuppi-app >/dev/null 2>&1 \
  || mc admin policy set local kuppi-app-policy user=kuppi-app >/dev/null
rm -f /tmp/kuppi-app-policy.json

cat >/root/kuppi-s3-credentials.env <<EOF
# Paste into Vercel environment variables (Production) to cut Kuppi over.
S3_ENDPOINT=https://${MINIO_DOMAIN}
S3_BUCKET=${KUPPI_BUCKET}
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=kuppi-app
S3_SECRET_ACCESS_KEY=${APP_SECRET}
EOF
chmod 600 /root/kuppi-s3-credentials.env
log "App credentials written to /root/kuppi-s3-credentials.env"

# ---------------------------------------------------------------------------
# 3. Instance firewall — Oracle's images ship restrictive rulesets; open 80/443
#    whichever firewall is in charge. (The cloud-side Security List must ALSO
#    allow 80/443 — see ops/README.md.)
# ---------------------------------------------------------------------------
if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then
  firewall-cmd --permanent --add-service=http --add-service=https >/dev/null && firewall-cmd --reload >/dev/null \
    || log "WARNING: could not configure firewalld"
  log "firewalld allows 80/443"
else
  for port in 80 443; do
    # Insert at the top of INPUT: index-based positions break when the base
    # ruleset is shorter than expected, and appending lands after a final
    # REJECT rule. Non-fatal where iptables does not exist at all.
    iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null \
      || { iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT 2>/dev/null || true; }
  done
  command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save >/dev/null || true
  log "iptables allows 80/443"
fi

# ---------------------------------------------------------------------------
# 4. Caddy — automatic Let's Encrypt TLS in front of MinIO
# ---------------------------------------------------------------------------
if ! command -v caddy >/dev/null 2>&1; then
  log "Installing Caddy"
  if command -v apt-get >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gnupg curl ca-certificates >/dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy >/dev/null
  else
    # RHEL family / Oracle Linux: Caddy lives in EPEL; Oracle ships its own
    # EPEL companion package, other distros take epel-release.
    PKG="$(command -v dnf || command -v yum)"
    "$PKG" install -y "oracle-epel-release-el$(rpm -E %rhel 2>/dev/null || echo 9)" >/dev/null 2>&1 \
      || "$PKG" install -y epel-release >/dev/null
    "$PKG" install -y caddy >/dev/null
  fi
fi

# SELinux (Oracle Linux defaults to enforcing) blocks Caddy connecting back to
# the loopback MinIO without this boolean.
if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Enforcing" ]; then
  setsebool -P httpd_can_network_connect 1 || log "WARNING: could not set httpd_can_network_connect"
  log "SELinux: httpd_can_network_connect enabled"
fi

cat >/etc/caddy/Caddyfile <<EOF
# Managed by Kuppi ops/vm-bootstrap.sh
${MINIO_DOMAIN} {
	encode zstd gzip
	reverse_proxy 127.0.0.1:9000
}
EOF
systemctl enable --now caddy >/dev/null 2>&1 || systemctl reload caddy

log "Waiting for certificate issuance on https://${MINIO_DOMAIN}"
TLS_OK=0
for i in $(seq 1 45); do
  if curl -fsS -m 6 "https://${MINIO_DOMAIN}/minio/health/live" >/dev/null 2>&1; then TLS_OK=1; break; fi
  sleep 4
done
if [ "$TLS_OK" = 1 ]; then
  log "SUCCESS: MinIO live at https://${MINIO_DOMAIN}"
else
  log "WARNING: TLS not reachable yet. Check DNS/security list, then: journalctl -u caddy"
  log "(bootstrap continues; everything else is already running)"
fi

cat <<EOF

============================================================
 Kuppi object storage bootstrap complete
   Public endpoint : https://${MINIO_DOMAIN}
   Bucket          : ${KUPPI_BUCKET} (public read)
   Credentials     : /root/kuppi-s3-credentials.env  (mode 600)
   MinIO console   : ssh -L 9001:127.0.0.1:9001 <user>@<vm-ip>  -> http://localhost:9001
 Next step: copy the S3_* values from the credentials file into the
 Kuppi deployment environment, then run ops/smoke-test.mjs.
============================================================
EOF
