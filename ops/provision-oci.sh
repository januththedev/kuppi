#!/usr/bin/env bash
# Provision the Kuppi MinIO VM on Oracle Cloud Always Free via the OCI CLI.
#
# Creates: VM.Standard.A1.Flex (4 OCPU / 24 GB, the full Always-Free ARM allotment),
# 200 GB boot volume (the whole free block-storage quota), public IP, and
# cloud-init that runs ops/vm-bootstrap.sh on first boot. Also opens 80/443 in
# the subnet's Security List so Caddy can get certificates.
#
# Prerequisites (one-time, see ops/README.md):
#   1. oci CLI installed + configured:   oci setup config
#   2. Env vars:
#        OCI_SUBNET_ID   required — OCID of a public subnet in your VCN
#        OCI_AD_NAME     optional — availability domain (auto-detected)
#        MINIO_DOMAIN    optional — else <ip>.sslip.io is used
#   3. An SSH keypair at ~/.ssh/kuppi_oci (generated if missing).
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "ERROR: $*" >&2; exit 1; }
command -v oci >/dev/null || fail "OCI CLI not installed. See https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/cliinstall.htm"
oci setup config --dry-run >/dev/null 2>&1 || [ -f ~/.oci/config ] || fail "Run 'oci setup config' first (needs API key from the console)."

COMPARTMENT="${OCI_COMPARTMENT_ID:-$(awk -F= '/^tenancy/{gsub(/ |\r/,"",$2); print $2}' ~/.oci/config)}"
[ -n "$COMPARTMENT" ] || fail "Cannot determine compartment; set OCI_COMPARTMENT_ID."
SUBNET="${OCI_SUBNET_ID:?Set OCI_SUBNET_ID to a public subnet OCID (ops/README.md shows where to find it)}"

SSH_KEY=~/.ssh/kuppi_oci
if [ ! -f "$SSH_KEY" ]; then
  echo "Generating SSH keypair $SSH_KEY"
  ssh-keygen -q -t ed25519 -N "" -f "$SSH_KEY"
fi

AD="${OCI_AD_NAME:-$(oci iam availability-domain list --compartment-id "$COMPARTMENT" --query 'data[0].name' --raw)}"
echo "Availability domain: $AD"

IMAGE_ID="$(oci compute image list \
  --compartment-id "$COMPARTMENT" \
  --operating-system "Canonical Ubuntu" --operating-system-version "22.04" \
  --shape "VM.Standard.A1.Flex" --sort-by TIME --sort-order DESC \
  --query "data[?\"os-version\"=='22.04'].id | [0]" --raw 2>/dev/null || true)"
if [ -z "${IMAGE_ID:-}" ] || [ "$IMAGE_ID" = "null" ]; then
  IMAGE_ID="$(oci compute image list --compartment-id "$COMPARTMENT" \
    --operating-system "Canonical Ubuntu" --operating-system-version "22.04" \
    --query 'data[0].id' --raw)"
fi
echo "Image: $IMAGE_ID"

# --- cloud-init payload = template with the bootstrap script embedded -------
B64="$(base64 -w0 ops/vm-bootstrap.sh)"
sed "s|__KUPPI_BOOTSTRAP_B64__|$B64|" ops/cloud-init.yaml > /tmp/kuppi-cloud-init.yaml

INSTANCE_NAME="kuppi-minio-$(date +%Y%m%d-%H%M%S)"
launch_instance() {
  oci compute instance launch \
    --compartment-id "$COMPARTMENT" \
    --availability-domain "$AD" \
    --shape "VM.Standard.A1.Flex" \
    --shape-config '{"ocpus":4,"memoryInGBs":24}' \
    --image-id "$IMAGE_ID" \
    --subnet-id "$SUBNET" \
    --assign-public-ip true \
    --boot-volume-size-in-gbs 200 \
    --display-name "$INSTANCE_NAME" \
    --ssh-authorized-keys-file "$SSH_KEY.pub" \
    --user-data-file /tmp/kuppi-cloud-init.yaml \
    --wait-for-state RUNNING
}

echo "Launching $INSTANCE_NAME (A1.Flex 4 OCPU / 24 GB / 200 GB boot)"
echo "NOTE: 'Out of host capacity' is common on the free tier — retrying automatically."
ATTEMPT=0
until launch_instance >/tmp/kuppi-launch.json 2>/tmp/kuppi-launch.err; do
  ATTEMPT=$((ATTEMPT + 1))
  [ $ATTEMPT -ge 13 ] && fail "13 launch attempts failed. Last error: $(tail -3 /tmp/kuppi-launch.err)"
  echo "Attempt $ATTEMPT failed: $(grep -o 'Out of host capacity.*\|NotAuthorizedOrNotFound.*\|LimitExceeded.*' /tmp/kuppi-launch.err | head -1) — retrying in 90 s"
  sleep 90
done

INSTANCE_OCID="$(python -c 'import json;print(json.load(open("/tmp/kuppi-launch.json"))["data"]["id"])' 2>/dev/null \
  || grep -o '"id": "[^"]*"' /tmp/kuppi-launch.json | head -1 | cut -d'"' -f4)"

# --- open 80/443 in the first security list of the subnet -------------------
SL_ID="$(oci network subnet get --subnet-id "$SUBNET" --query 'data."security-list-ids"[0]' --raw)"
HAS_HTTPS="$(oci network security-list get --security-list-id "$SL_ID" \
  --query 'length(data."ingress-security-rules"[?protocol == "6" && "tcp-options"."destination-port-range".max >= `443` && "tcp-options"."destination-port-range".min <= `80`])' --raw 2>/dev/null || echo 0)"
if [ "${HAS_HTTPS:-0}" = "0" ]; then
  echo "Adding 80/443 ingress to security list $SL_ID"
  CURRENT="$(oci network security-list get --security-list-id "$SL_ID" --query 'data."ingress-security-rules"' --raw)"
  ADDED="$(CURRENT="$CURRENT" python - <<'PY'
import json, os
rules = json.loads(os.environ["CURRENT"])
for port in (80, 443):
    rules.append({
        "protocol": "6",
        "source": "0.0.0.0/0",
        "source-type": "CIDR_BLOCK",
        "tcp-options": {"destination-port-range": {"min": port, "max": port}},
    })
print(json.dumps(rules))
PY
)"
  oci network security-list update --security-list-id "$SL_ID" --ingress-security-rules "$ADDED" --force
else
  echo "Security list already allows 80/443"
fi

echo "Fetching public IP..."
IP=""
for _ in $(seq 1 30); do
  IP="$(oci compute instance list-vnics --compartment-id "$COMPARTMENT" --instance-id "$INSTANCE_OCID" \
      --query 'data[0]."public-ip"' --raw 2>/dev/null || true)"
  [ -n "$IP" ] && [ "$IP" != "null" ] && break
  sleep 10
done

cat <<EOF

============================================================
 Instance : $INSTANCE_NAME ($INSTANCE_OCID)
 Public IP: $IP
 SSH      : ssh -i ~/.ssh/kuppi_oci ubuntu@$IP
 Bootstrap runs automatically on first boot (~3-4 min):
    ssh -i ~/.ssh/kuppi_oci ubuntu@$IP 'tail -20 /var/log/kuppi-bootstrap.log'
 Then fetch app credentials for the Vercel cutover:
    scp -i ~/.ssh/kuppi_oci ubuntu@$IP:/root/kuppi-s3-credentials.env ./
 Finally verify: S3_ENDPOINT=https://$((echo $IP | tr '.' '-').sslip.io) node ops/smoke-test.mjs
============================================================
EOF
