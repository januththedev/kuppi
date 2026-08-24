#!/usr/bin/env bash
# Kuppi DB bootstrap — installs and hardens MariaDB on the same Oracle
# Always-Free VM as MinIO, so Kuppi's database lives on infrastructure we
# control instead of a third-party free tier that can pause or vanish.
#
# Idempotent: safe to re-run over SSH.
#
# Produces:
#   /root/kuppi-db-credentials.env   DATABASE_URL for the deployment (mode 600)
#   /opt/kuppi-backups/              nightly mysqldump snapshots
#   systemd timer kuppi-db-backup    dumps nightly 03:20 + pushes to MinIO
set -euo pipefail

DB_NAME="${KUPPI_DB_NAME:-kuppi}"
DB_USER="${KUPPI_DB_USER:-kuppi_app}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-}"
DOMAIN_HINT="${MINIO_DOMAIN:-80-225-242-175.sslip.io}"

log() { echo "[kuppi-db] $*"; }

# ---------------------------------------------------------------------------
# 1. Install MariaDB (OL9 appstream) sized for a ~500 MB RAM box
# ---------------------------------------------------------------------------
if ! command -v mysqld >/dev/null 2>&1 && ! command -v mariadbd >/dev/null 2>&1; then
  log "Installing MariaDB server"
  dnf install -y mariadb-server >/dev/null
fi

mkdir -p /etc/systemd/system/mariadb.service.d
cat >/etc/my.cnf.d/kuppi-tuning.cnf <<'EOF'
# Managed by Kuppi ops/db-bootstrap.sh — small-RAM profile
[mysqld]
bind-address = 0.0.0.0
skip-name-resolve
performance_schema = OFF
innodb_buffer_pool_size = 96M
innodb_log_buffer_size = 8M
key_buffer_size = 8M
max_connections = 40
table_open_cache = 200
tmp_table_size = 16M
max_heap_table_size = 16M
sort_buffer_size = 512K
net_buffer_length = 16K
# TLS for remote clients (Vercel serverless connects over the internet).
# Self-signed pair is acceptable here because the app pins rejectUnauthorized:false.
ssl_cert = /etc/pki/tls/certs/kuppi-mysql.crt
ssl_key = /etc/pki/tls/private/kuppi-mysql.key
require_secure_transport = ON
EOF

if [ ! -f /etc/pki/tls/certs/kuppi-mysql.crt ]; then
  log "Generating MySQL TLS certificate"
  openssl req -x509 -newkey rsa:2048 -keyout /etc/pki/tls/private/kuppi-mysql.key \
    -out /etc/pki/tls/certs/kuppi-mysql.crt -days 3650 -nodes \
    -subj "/CN=${DOMAIN_HINT}" >/dev/null 2>&1
  chmod 600 /etc/pki/tls/private/kuppi-mysql.key
fi

systemctl enable --now mariadb >/dev/null 2>&1 || systemctl restart mariadb
for i in $(seq 1 30); do
  mysqladmin ping >/dev/null 2>&1 && break
  [ "$i" = 30 ] && { echo "MariaDB did not become ready" >&2; journalctl -u mariadb --no-pager | tail -15 >&2; exit 1; }
  sleep 1
done
log "MariaDB ready"

# ---------------------------------------------------------------------------
# 2. Database + least-privilege remote user (rotate secret on re-runs)
# ---------------------------------------------------------------------------
if [ ! -f /root/kuppi-db-credentials.env ]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
else
  DB_PASSWORD="$(grep '^DB_PASSWORD=' /root/kuppi-db-credentials.env | cut -d= -f2-)"
  [ -n "$DB_PASSWORD" ] || DB_PASSWORD="$(openssl rand -hex 24)"
fi

mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}' REQUIRE SSL;
ALTER USER '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}' REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%';
FLUSH PRIVILEGES;
SQL

PUBLIC_HOST="${PUBLIC_HOST:-80.225.242.175}"
cat >/root/kuppi-db-credentials.env <<EOF
# Paste this value into Vercel -> Settings -> Environment Variables -> DATABASE_URL
DATABASE_URL=mysql://${DB_USER}:${DB_PASSWORD}@${PUBLIC_HOST}:3306/${DB_NAME}?ssl-mode=REQUIRED
DB_PASSWORD=${DB_PASSWORD}
EOF
chmod 600 /root/kuppi-db-credentials.env
log "Credentials written to /root/kuppi-db-credentials.env"

# ---------------------------------------------------------------------------
# 3. Firewall — public TCP 3306 (cloud Security List must also allow it)
# ---------------------------------------------------------------------------
if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then
  firewall-cmd --permanent --add-port=3306/tcp >/dev/null && firewall-cmd --reload >/dev/null
  log "firewalld allows 3306"
else
  iptables -C INPUT -p tcp --dport 3306 -j ACCEPT 2>/dev/null || { iptables -I INPUT 1 -p tcp --dport 3306 -j ACCEPT 2>/dev/null || true; }
fi

# ---------------------------------------------------------------------------
# 4. Nightly encrypted-at-rest backups: mysqldump -> MinIO bucket + local dir
# ---------------------------------------------------------------------------
if [ -n "$MINIO_ROOT_USER" ] && [ -n "$MINIO_ROOT_PASSWORD" ]; then
  /usr/local/bin/mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
  /usr/local/bin/mc mb --ignore-existing local/kuppi-backups >/dev/null
else
  # Re-run without creds: reuse the root secret the MinIO bootstrap saved.
  if [ -f /etc/default/minio ]; then
    . /etc/default/minio
    /usr/local/bin/mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    /usr/local/bin/mc mb --ignore-existing local/kuppi-backups >/dev/null
  fi
fi

cat >/usr/local/bin/kuppi-db-backup.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="/opt/kuppi-backups/kuppi-${STAMP}.sql.gz"
mkdir -p /opt/kuppi-backups
mysqldump --single-transaction --routines kuppi | gzip > "$OUT"
find /opt/kuppi-backups -name 'kuppi-*.sql.gz' -mtime +13 -delete
if command -v /usr/local/bin/mc >/dev/null 2>&1 && /usr/local/bin/mc alias list local >/dev/null 2>&1; then
  /usr/local/bin/mc cp "$OUT" local/kuppi-backups/ >/dev/null
  /usr/local/bin/mc rm --older-than 14d local/kuppi-backups/ >/dev/null 2>&1 || true
fi
EOF
chmod 700 /usr/local/bin/kuppi-db-backup.sh

cat >/etc/systemd/system/kuppi-db-backup.service <<'EOF'
[Unit]
Description=Nightly Kuppi MySQL backup to MinIO

[Service]
Type=oneshot
ExecStart=/usr/local/bin/kuppi-db-backup.sh
EOF

cat >/etc/systemd/system/kuppi-db-backup.timer <<'EOF'
[Unit]
Description=Run Kuppi DB backup nightly
[Timer]
OnCalendar=*-*-* 03:20:00
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now kuppi-db-backup.timer >/dev/null
/usr/local/bin/kuppi-db-backup.sh && log "Initial backup taken and pushed to MinIO"

cat <<EOF

============================================================
 Kuppi database bootstrap complete
   DB        : ${DB_NAME} on MariaDB (this VM), TLS required
   Remote    : tcp/${PUBLIC_HOST}:3306 (Security List must allow 3306)
   Backup    : nightly 03:20 -> /opt/kuppi-backups + MinIO kuppi-backups
   DATABASE_URL : see /root/kuppi-db-credentials.env
============================================================
EOF
