# 05 — Air-Gap OS Deployment Guide

## 1. Operating System Hardening Philosophy

Software-level controls inside an application (such as monkey-patching `socket`) provide essential defense-in-depth, but **absolute air-gap isolation must be guaranteed by the operating system kernel and physical infrastructure**.

To guarantee full compliance with Air-Gap Policy (POL-001), deployment teams must configure host-level packet filtering. Clarix AI includes ready-to-use deployment scripts in `clarix-backend/deploy/`.

---

## 2. Linux Firewall Configuration

### A. Modern Linux: `nftables` (`deploy/nftables-airgap.conf`)

`nftables` provides clean, high-performance packet filtering in modern Linux kernels.

```ini
#!/usr/sbin/nft -f

flush ruleset

table inet filter {
    chain input {
        type filter hook input priority 0; policy drop;

        # Allow established and related loopback traffic
        iif "lo" accept
        ct state established,related accept
    }

    chain forward {
        type filter hook forward priority 0; policy drop;
    }

    chain output {
        type filter hook output priority 0; policy drop;

        # Permit ONLY loopback interface communications
        oif "lo" accept
        
        # Log and drop any external egress packet attempt
        log prefix "[CLARIX AIRGAP BLOCKED] " drop
    }
}
```

**To apply:**
```bash
sudo cp deploy/nftables-airgap.conf /etc/nftables.conf
sudo systemctl restart nftables
sudo systemctl enable nftables
```

---

### B. Legacy Linux: `iptables` (`deploy/iptables-airgap.sh`)

For systems using traditional `iptables`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Flush existing rules
iptables -F
iptables -X

# 2. Set default policies to DROP
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# 3. Allow all traffic on loopback interface
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# 4. Allow stateful connections on loopback
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# 5. Log dropped packets for audit review
iptables -A OUTPUT -m limit --limit 5/min -j LOG --log-prefix "CLARIX-EGRESS-DROP: " --log-level 4
```

**To apply:**
```bash
sudo bash deploy/iptables-airgap.sh
```

---

## 3. macOS / BSD: Packet Filter (`deploy/pf-airgap.conf`)

For macOS or BSD test environments:

```ini
# Strict Loopback Only Packet Filter
set skip on lo0
block all
pass in quick on lo0 all
pass out quick on lo0 all
```

**To apply on macOS:**
```bash
sudo pfctl -ef deploy/pf-airgap.conf
```

---

## 4. Systemd Hardening (`deploy/clarix.service`)

Clarix AI provides a production systemd unit file with kernel-level cgroup isolation and network sandboxing:

```ini
[Unit]
Description=Clarix AI Air-Gapped Security Backend
After=network.target local-fs.target
Requires=local-fs.target

[Service]
Type=simple
User=clarix
Group=clarix
WorkingDirectory=/opt/clarix/clarix-backend
EnvironmentFile=/etc/clarix/backend.env
ExecStart=/opt/clarix/clarix-backend/.venv/bin/python3 -m clarix

# --- Cgroup & Network Sandboxing ---
# Drop all non-loopback network packets at the kernel level
IPAddressDeny=any
IPAddressAllow=127.0.0.1 ::1

# Filesystem & Process Protection
ProtectSystem=strict
ReadWritePaths=/opt/clarix/data
ProtectHome=true
PrivateTmp=true
NoNewPrivileges=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
MemoryDenyWriteExecute=true
RestrictRealtime=true

Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

---

## 5. Host Air-Gap Verification (`deploy/verify_airgap.sh`)

Before approving a host for classified operations, run the built-in automated verification script:

```bash
cd clarix-backend
bash deploy/verify_airgap.sh
```

### Verification Checks Performed:
1. **DNS Resolution**: Probes external root nameservers (`1.1.1.1`, `8.8.8.8`) — MUST FAIL.
2. **TCP Socket Egress**: Attempts outbound socket to `https://google.com` (443) — MUST BE REFUSED / TIMEOUT.
3. **UDP Packet Test**: Emits raw UDP datagrams — MUST BE DROPPED.
4. **Loopback Reachability**: Tests local loopback `127.0.0.1:8000` (FastAPI) and `127.0.0.1:11434` (Ollama) — MUST SUCCEED.
5. **Kernel Filtering Rules**: Verifies active `nftables` or `iptables` ruleset.

---

## 6. Offline Ollama Model Deployment Workflow

In a truly air-gapped facility, the host cannot run `ollama pull`. Follow this transfer procedure:

```
+---------------------------+                +-------------------------+
| CONNECTED STAGING MACHINE |                | AIR-GAPPED SECURE HOST  |
|                           |                |                         |
| 1. ollama pull llama3     |  Secure Media  | 4. mkdir -p ~/.ollama   |
| 2. ollama pull nomic-embed|  (Encrypted    | 5. Copy models/ dir     |
| 3. Tar ~/.ollama/models   | -------------> | 6. Start Ollama offline |
|    into archive.tar       |   USB / Optical)  OLLAMA_HOST=127.0.0.1  |
+---------------------------+                +-------------------------+
```

### Step-by-Step Procedure:

1. **On Connected Staging Machine**:
   ```bash
   ollama pull llama3
   ollama pull nomic-embed-text
   tar -cf ollama-models.tar -C ~/.ollama models
   sha256sum ollama-models.tar > checksums.txt
   ```

2. **Security Inspection & Physical Transfer**:
   Scan the archive for malicious payloads and transfer via approved air-gap transfer media (e.g., optical WORM disc or hardware-encrypted drive).

3. **On Secure Air-Gapped Machine**:
   ```bash
   sha256sum -c checksums.txt
   mkdir -p ~/.ollama
   tar -xf ollama-models.tar -C ~/.ollama/
   export OLLAMA_HOST="127.0.0.1:11434"
   ollama serve
   ```
4. Verify local model availability:
   ```bash
   curl http://127.0.0.1:11434/api/tags
   ```
