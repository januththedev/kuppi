#!/bin/bash
# Test fixture ONLY — never install on a real VM.
#
# Minimal systemctl stand-in used by the container integration test of
# vm-bootstrap.sh (containers have no systemd). For `enable --now <service>`
# it launches the service the same way the packaged unit would: MinIO from
# /etc/default/minio, Caddy from /etc/caddy/Caddyfile.
case "$*" in
  *"minio"*)
    set -a
    # shellcheck disable=SC1091
    source /etc/default/minio
    set +a
    nohup /usr/bin/minio server $MINIO_OPTS $MINIO_VOLUMES >/var/log/minio-stub.log 2>&1 &
    echo "(stub) launched minio pid $!"
    ;;
  *"caddy"*)
    nohup /usr/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile >/var/log/caddy-stub.log 2>&1 &
    echo "(stub) launched caddy pid $!"
    ;;
esac
exit 0
