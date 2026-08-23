# Kuppi ops — Oracle Always-Free VM + MinIO

Self-hosted S3-compatible storage for Kuppi uploads. Replaces Vercel Blob with
**MinIO on an Oracle Cloud Always-Free ARM VM**: 4 OCPU / 24 GB RAM / 200 GB
block storage, free forever, fully under our control.

```
Browser ── presigned PUT ──────────────▶ MinIO (Oracle VM, ARM)
    ▲                                      ▲
    │ tRPC resource.uploadUrl              │ reverse proxy + auto-TLS
    ▼                                      │
Kuppi API (Vercel) ────────────────▶ Caddy :443 ──▶ 127.0.0.1:9000
    │
    └── MySQL stores permanent public URL https://<domain>/<bucket>/<key>
```

Everything is scripted. The **only manual step is creating the Oracle account
itself** (credit card + phone verification) — after that, either path below can
be driven end-to-end from this machine.

---

## 0. One-time manual setup (only you can do this)

1. Sign up at <https://www.oracle.com/cloud/free/> (credit card required for
   identity check; Always-Free resources never expire).
2. After first login, note your **tenancy OCID**, region, and username
   (Console → Profile → Tenancy / User settings).
3. Create an API signing key so the CLI/agent can drive everything:
   - Profile → **User settings → API keys → Add API key** → paste the generated
     `~/.oci/oci_api_key_public.pem`, save the fingerprint.
4. Networking: create a VCN with a **public subnet** if none exists
   (Networking → Virtual cloud networks → Start VCN Wizard "Create VCN with
   Internet Connectivity"). Copy the subnet's **OCID**.
5. Install and configure the CLI locally:
   ```
   pip install oci-cli        # or the Windows MSI from Oracle docs
   oci setup config           # paste tenancy/user OCIDs, region, fingerprint
   ```

Free-tier limits to respect: A1 total of **4 OCPU + 24 GB** across all
instances; block storage total **200 GB** (this setup uses one instance with a
200 GB boot volume). "Out of host capacity" errors at launch are common — the
provisioner retries automatically.

## Path A — fully automated (recommended)

With OCI configured:

```bash
export OCI_SUBNET_ID=ocid1.subnet.oc1...          # from step 4
# optional: MINIO_DOMAIN=minio.kuppi.example      # else <ip>.sslip.io auto-TLS
ops/provision-oci.sh
```

Creates the A1 instance, injects `vm-bootstrap.sh` via cloud-init, opens
80/443 in the Security List, waits for an IP, and prints next commands.
First boot takes ~3–4 minutes; watch progress with the printed
`tail /var/log/kuppi-bootstrap.log` command.

## Path B — console-created VM

If you prefer clicking through Console → Compute → Create instance
(shape `VM.Standard.A1.Flex`, 4 OCPU / 24 GB, Ubuntu 22.04, boot volume
200 GB, public IP, paste your SSH public key), then hand the IP over:

```bash
ops/provision-from-local.sh <VM_IP>            # user defaults to ubuntu
```

Pushes the bootstrap script, runs it, pulls back credentials to
`.kuppi-s3-credentials.env` (git-ignored), and smoke-tests the endpoint.

> Both paths also need ports 80/443 open in the **Security List** (Path A does
> it automatically; in Path B add ingress rules TCP 80+443 from 0.0.0.0/0).
> The script handles the *instance-level* iptables rules itself — Oracle's
> Ubuntu image blocks everything but SSH by default.

## What vm-bootstrap.sh installs

| Piece | Detail |
|---|---|
| MinIO | Official arm64 deb, systemd service, API bound to `127.0.0.1:9000`, data at `/opt/minio/data` |
| Bucket | `kuppi-uploads`, anonymous download-only (mirrors today's public Blob URLs) |
| App user | `kuppi-app` with a least-privilege policy scoped to the bucket; keys land in `/root/kuppi-s3-credentials.env` (mode 600) |
| Caddy | Automatic Let's Encrypt TLS for `<ip>.sslip.io` or your domain; proxies `https://<domain>` → MinIO |
| Firewall | iptables ACCEPT for 80/443 (persisted via netfilter-persistent when present) |

Re-running any provisioning script is safe — every step is idempotent.

## Cutover (Vercel)

1. Copy the `S3_*` values from `/root/kuppi-s3-credentials.env` into Vercel →
   Project → Settings → Environment Variables (**Production**):
   `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION=us-east-1`,
   `S3_ACCESS_KEY_ID=kuppi-app`, `S3_SECRET_ACCESS_KEY=<secret>`.
2. Redeploy. `storage.mode` now reports `"s3"` and new uploads go straight to
   MinIO. Keep `BLOB_READ_WRITE_TOKEN` set during migration — old files still
   resolve until migrated.
3. Migrate history from a machine that can reach both MySQL and the VM:
   ```bash
   node ops/migrate-vercel-blob.mjs --dry-run     # preview
   node ops/migrate-vercel-blob.mjs               # copy objects + repoint URLs
   ```
   Idempotent; skips already-copied objects by size; never deletes Blob data.
4. Verify, then remove `BLOB_READ_WRITE_TOKEN` from Vercel to finish the
   transition (rollback before that = delete the S3_* vars).

## Verification & maintenance

```bash
node ops/smoke-test.mjs ./kuppi-s3-credentials.env   # full write/read/delete probe
ssh vm 'mc admin info local'                          # capacity/drives
docker compose up                                     # n/a — see ops/dev-minio.sh for local dev
ops/dev-minio.sh                                      # identical local MinIO on :9000/:9001
pnpm exec node scripts/e2e-s3.mjs                     # app-level e2e vs local MinIO
```

MinIO console (server UI): `ssh -L 9001:127.0.0.1:9001 ubuntu@<ip>` →
<http://localhost:9001>. The port is loopback-only on the VM by design.

## Security notes

- Only 22/80/443 are reachable; MinIO itself never binds publicly.
- The `kuppi-app` key cannot create buckets or touch other prefixes' admin APIs.
- Rotate the app secret: `mc admin user add` again + update Vercel env.
- `.kuppi-s3-credentials.env` is git-ignored — never commit credentials.
