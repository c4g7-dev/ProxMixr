# Quick Start Guide

Get up and running with Termix-Proxmox Sync in 5 minutes!

## What This Tool Does

✅ **Automatically syncs** running Proxmox VMs/LXCs to Termix
✅ **Smart filtering** - Only syncs running machines (ignores stopped/offline)
✅ **SSH detection** - Only adds machines with SSH on port 22
✅ **Default user** - Uses 'root' as default SSH username
✅ **Advanced IP detection** - Tries 4 different methods to find IPs

## Prerequisites

- Node.js 16 or higher installed
- Access to Proxmox VE API
- Termix instance with API access

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Open web browser:**
   ```
   http://localhost:3000
   ```

## Configuration (Web UI)

### Step 1: Configure Proxmox

1. Go to **Configuration** tab
2. Enter Proxmox URL: `https://your-proxmox-server.com:8006`
3. Choose authentication:
   - **Password**: Enter username (e.g., `root@pam`) and password
   - **API Token** (recommended): Enter Token ID and Secret
4. Click **Test Proxmox Connection** to verify

### Step 2: Configure Termix

1. Enter Termix URL: `https://your-termix-instance.com`
2. Enter API Key (JWT Bearer token from Termix settings)
3. Click **Test Termix Connection** to verify

### Step 3: Configure SSH Defaults

1. Set default SSH username (usually `root`)
2. Optionally set default password (leave empty if using SSH keys)
3. Set folder name for organizing hosts in Termix (default: `Proxmox`)
4. Enable/disable SSH port checking (recommended: enabled)

### Step 4: Save Configuration

Click **Save Configuration** button at the bottom

## Running Your First Sync

### Option 1: Preview First (Recommended)

1. Go to **Preview** tab
2. Click **Load Preview**
3. Review which VMs/LXCs will be synced
4. Check SSH availability status
5. Go to **Dashboard** and click **Sync Now**

### Option 2: Direct Sync

1. Go to **Dashboard** tab
2. Click **Sync Now**
3. Confirm the action
4. Wait for sync to complete

## Getting Termix API Key

1. Log in to your Termix instance
2. Go to **Settings** → **API**
3. Generate new API token
4. Copy the JWT token
5. Paste it in the Termix configuration

## Getting Proxmox API Token (Recommended)

1. Log in to Proxmox web interface
2. Navigate to **Datacenter** → **Permissions** → **API Tokens**
3. Click **Add** button
4. Select user (e.g., `root@pam`)
5. Enter token ID (e.g., `termix-sync`)
6. Uncheck "Privilege Separation" if you want full access
7. Click **Add**
8. Copy both Token ID and Secret
9. Use in format: `root@pam!termix-sync` for Token ID

## Troubleshooting

### Connection Test Fails

- **Proxmox**: Verify URL includes `https://` and port `:8006`
- **Termix**: Ensure API is enabled in Termix settings
- Check firewall rules allow connections

### No VMs Found

- Ensure VMs are running (stopped VMs are excluded)
- Check that QEMU Guest Agent is installed in VMs
- For LXCs, verify network configuration exists

### SSH Check Fails

- Verify SSH is running on port 22
- Check firewall allows SSH connections
- Try disabling SSH check temporarily in configuration

### No IP Addresses

- Install QEMU Guest Agent in VMs: `apt install qemu-guest-agent`
- Restart QEMU Guest Agent: `systemctl restart qemu-guest-agent`
- For LXCs, ensure static IP is configured

## Next Steps

- View sync history in **History** tab
- Set up scheduled syncs (coming soon)
- Configure custom tags and folders per node
- Set up different credentials for different VMs

## Support

For issues and questions, please check the main [README.md](README.md) or create an issue on GitHub.
