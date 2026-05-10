# Feature Summary

## ✅ Already Implemented Features

### 1. Default SSH User: Root
- **Location:** [src/clients/termix-client.js:98](src/clients/termix-client.js#L98)
- **How it works:** All synced hosts default to username 'root'
- **Customizable:** Yes, can be changed in Configuration tab

### 2. Ignores Stopped/Offline VMs
- **Location:** [src/clients/proxmox-client.js:199](src/clients/proxmox-client.js#L199)
- **How it works:** Only VMs with `status: 'running'` are synced
- **Behavior:**
  - Stopped VMs: ❌ Skipped
  - Paused VMs: ❌ Skipped
  - Running VMs: ✅ Synced

### 3. Advanced IP Detection (4 Methods)
The app tries multiple methods in order until an IP is found:

#### Method 1: QEMU Guest Agent (VMs only)
- **Location:** [src/clients/proxmox-client.js:204-206](src/clients/proxmox-client.js#L204-L206)
- **API:** `/nodes/{node}/qemu/{vmid}/agent/network-get-interfaces`
- **Requirements:** QEMU Guest Agent must be installed and running
- **Best for:** VMs with guest agent

#### Method 2: LXC Status API (LXCs only)
- **Location:** [src/clients/proxmox-client.js:209-211](src/clients/proxmox-client.js#L209-L211)
- **API:** `/nodes/{node}/lxc/{vmid}/status/current`
- **Parses:** `network.eth*.inet` field
- **Best for:** LXC containers

#### Method 3: Config Parsing
- **Location:** [src/clients/proxmox-client.js:214-219](src/clients/proxmox-client.js#L214-L219)
- **Parses:**
  - LXC: `net0`, `net1`, etc. → `ip=10.27.27.185/24`
  - QEMU: `ipconfig0`, `ipconfig1`, etc. → `ip=10.27.27.185/24,gw=...`
- **Best for:** Statically configured IPs

#### Method 4: Network Interfaces API (LXCs only)
- **Location:** [src/clients/proxmox-client.js:222-224](src/clients/proxmox-client.js#L222-L224)
- **API:** `/nodes/{node}/lxc/{vmid}/interfaces`
- **Parses:** Interface inet addresses
- **Best for:** LXCs with dynamic IPs

### 4. SSH Port 22 Checking
- **Location:** [src/utils/ssh-checker.js](src/utils/ssh-checker.js)
- **How it works:** Tests TCP connection to port 22 before syncing
- **Timeout:** 3 seconds (configurable)
- **Behavior:**
  - SSH responds: ✅ Added to Termix
  - SSH timeout/refused: ❌ Skipped
  - Can be disabled in Configuration

### 5. Smart Filtering
Only syncs hosts that meet ALL criteria:
- ✅ Status is 'running'
- ✅ Has a valid IP address
- ✅ SSH port 22 is responding (if check enabled)

## 🎯 Current Sync Flow

```
Proxmox VMs/LXCs
        ↓
Filter: Only 'running' status
        ↓
Try 4 methods to get IP
        ↓
Filter: Only hosts with IP
        ↓
Check SSH port 22 (optional)
        ↓
Filter: Only SSH available
        ↓
Create Termix host entry
        ↓
Sync to Termix with:
  - Username: root (default)
  - Port: 22
  - Folder: Proxmox
  - Tags: proxmox, vm/lxc type, node name
```

## 📊 What Gets Synced?

### ✅ WILL Sync:
- Running VMs with IP and SSH
- Running LXCs with IP and SSH
- VMs/LXCs with static IPs configured
- VMs/LXCs with QEMU/LXC agent reporting IPs

### ❌ WON'T Sync:
- Stopped/paused VMs or LXCs
- Running VMs/LXCs without detectable IP
- Running VMs/LXCs with no SSH on port 22 (if check enabled)
- Templates
- VMs/LXCs on offline Proxmox nodes

## 🔧 Configuration Options

All these can be configured in the Web UI:

| Setting | Default | Description |
|---------|---------|-------------|
| SSH Username | `root` | Default SSH user for all hosts |
| SSH Password | (empty) | Default password (or leave empty for keys) |
| Folder | `Proxmox` | Termix folder to organize hosts |
| Check SSH | `true` | Test port 22 before syncing |
| SSH Timeout | `3000ms` | Timeout for SSH port check |

## 💡 Tips

1. **Most LXCs should now get IPs** - The new LXC-specific methods (Status + Interfaces APIs) dramatically improve detection

2. **VMs need QEMU Guest Agent** - Install with:
   ```bash
   apt install qemu-guest-agent
   systemctl enable --now qemu-guest-agent
   ```

3. **Disable SSH check temporarily** - If you know SSH is available but check fails (firewall), disable it in Config

4. **Check Preview first** - Always use Preview tab to see what will be synced before running actual sync
