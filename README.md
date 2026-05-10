# ProxMixr 🎭

**Mix your Proxmox VMs/LXCs into Termix - Automagically!**

Automatically synchronize your Proxmox VMs and LXC containers to Termix SSH client manager. ProxMixr monitors your Proxmox infrastructure and keeps your Termix SSH connections up-to-date with minimal configuration.

## Features

- **Automatic Discovery**: Fetches all running VMs and LXC containers from Proxmox
- **Smart Filtering**: Only syncs running VMs/LXCs (stopped/offline machines are ignored)
- **SSH Port Checking**: Only syncs machines with SSH (port 22) available
- **Smart Naming**: Uses Proxmox hostname for Termix client names
- **Advanced IP Detection**: Uses 4 different methods to find IP addresses:
  - QEMU Guest Agent (for VMs)
  - LXC Status API (for containers)
  - Network configuration parsing
  - Network interfaces API
- **Default SSH User**: Defaults to 'root' user for all connections
- **Web UI**: Modern, minimalistic web interface for configuration
- **Sync History**: Track all sync operations with detailed logs
- **Preview Mode**: See what will be synced before running
- **Flexible Auth**: Supports both Proxmox password and API token authentication
- **Organized**: Automatically organizes hosts in folders and tags them

## Installation

### Prerequisites

- Node.js 16 or higher
- Access to Proxmox VE API
- Termix instance with API access

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd TermixProxmox
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment (optional)**
   ```bash
   cp .env.example .env
   # Edit .env with your settings (or use the web UI)
   ```

4. **Start the application**
   ```bash
   npm start
   ```

5. **Access the web interface**
   Open your browser and navigate to: `http://localhost:3000`

## Configuration

### Using the Web UI (Recommended)

1. Navigate to the **Configuration** tab
2. Fill in your Proxmox details:
   - Proxmox URL (e.g., `https://proxmox.example.com:8006`)
   - Username/Password OR API Token
3. Fill in your Termix details:
   - Termix URL (e.g., `https://termix.example.com`)
   - API Key (JWT Bearer token)
4. Configure SSH defaults:
   - Default username (usually `root`)
   - Default password (optional, leave empty if using SSH keys)
   - Termix folder name (default: `Proxmox`)
   - SSH timeout for connection checks
5. Click **Save Configuration**

### Using Environment Variables

Alternatively, you can configure via `.env` file:

```env
# Proxmox Configuration
PROXMOX_URL=https://proxmox.example.com:8006
PROXMOX_USER=root@pam
PROXMOX_PASSWORD=your-password

# OR use API token
PROXMOX_TOKEN_ID=user@realm!tokenid
PROXMOX_TOKEN_SECRET=your-token-secret

# Termix Configuration
TERMIX_URL=https://termix.example.com
TERMIX_API_KEY=your-jwt-bearer-token

# SSH Configuration
DEFAULT_SSH_USER=root
DEFAULT_SSH_PORT=22
SSH_TIMEOUT_MS=3000
```

### Getting Termix API Key

1. Log in to your Termix instance
2. Navigate to Settings → API
3. Generate a new API token
4. Copy the JWT token and use it as `TERMIX_API_KEY`

### Getting Proxmox API Token (Recommended)

1. Log in to Proxmox web interface
2. Navigate to Datacenter → Permissions → API Tokens
3. Create a new API token for your user
4. Copy the Token ID and Secret
5. Use format: `PROXMOX_TOKEN_ID=user@pam!tokenname`

## Usage

### Web Interface

The web UI provides four main sections:

1. **Dashboard**: Quick actions and system status
   - Test connections to Proxmox and Termix
   - Run sync immediately
   - View system health

2. **Configuration**: Manage all settings
   - Proxmox credentials
   - Termix API settings
   - SSH defaults
   - Sync options

3. **Preview**: See what will be synced
   - View all discovered VMs/LXCs
   - Check SSH availability status
   - See which hosts will be synced

4. **History**: View past sync operations
   - Detailed logs of each sync
   - Success/failure status
   - Number of hosts synced

### How It Works

1. **Fetch VMs**: Connects to Proxmox and fetches all running VMs and LXC containers
2. **Get IPs**: Attempts to get IP addresses from:
   - QEMU Guest Agent (for VMs)
   - Network configuration (for LXCs and VMs)
3. **Check SSH**: Tests if port 22 is open and responding (optional)
4. **Filter**: Only includes hosts with valid IPs and SSH available (if checking enabled)
5. **Sync**: Creates/updates hosts in Termix using the JSON import API

### SSH Port Checking

The application can verify SSH availability before syncing:
- **Enabled** (default): Only syncs VMs where port 22 responds
- **Disabled**: Syncs all VMs with IP addresses (SSH check skipped)

Configure this in the **Configuration** tab under "Only sync VMs with SSH port 22 available"

## API Endpoints

The application exposes a REST API:

- `GET /api/status` - Application status
- `GET /api/config` - Get current configuration
- `POST /api/config` - Update configuration
- `POST /api/test/proxmox` - Test Proxmox connection
- `POST /api/test/termix` - Test Termix connection
- `GET /api/sync/preview` - Preview sync without executing
- `POST /api/sync` - Perform sync
- `GET /api/sync/history` - Get sync history

## Architecture

```
├── src/
│   ├── clients/
│   │   ├── proxmox-client.js    # Proxmox API integration
│   │   └── termix-client.js     # Termix API integration
│   ├── services/
│   │   └── sync-service.js      # Main sync logic
│   ├── utils/
│   │   └── ssh-checker.js       # SSH port availability checker
│   ├── db/
│   │   └── config-store.js      # SQLite configuration storage
│   └── server.js                # Express API server
├── public/
│   ├── index.html               # Web UI
│   ├── styles.css               # Styling
│   └── app.js                   # Frontend JavaScript
└── package.json
```

## Troubleshooting

### VMs not getting IP addresses

- Ensure QEMU Guest Agent is installed and running in VMs
- For LXCs, check that network configuration includes static IPs
- Verify VMs have network interfaces configured

### SSH check always fails

- Verify firewall allows connections on port 22
- Check if SSH service is running on the VMs
- Increase SSH timeout in configuration (default: 3000ms)
- Try disabling SSH check if you know SSH is available

### Proxmox connection fails

- Verify URL includes protocol and port (e.g., `https://proxmox:8006`)
- Check credentials are correct
- If using self-signed certificates, this is handled automatically
- Ensure API token has proper permissions if using token auth

### Termix connection fails

- Verify Termix URL is correct and accessible
- Check that API key is valid and not expired
- Ensure Termix API is enabled in settings
- Test API endpoint directly: `curl -H "Authorization: Bearer TOKEN" https://termix/api/hosts`

## Development

```bash
# Install dependencies
npm install

# Run in development mode with auto-reload
npm run dev

# Run in production
npm start
```

## Security Notes

- All credentials are stored in SQLite database (not in `.env`)
- Sensitive fields are not sent to the frontend
- SSL certificate verification is disabled for Proxmox (common for self-signed certs)
- Consider using API tokens instead of passwords
- Run behind reverse proxy with HTTPS in production

## License

MIT

## Contributing

Contributions welcome! Please feel free to submit issues or pull requests.

## Credits

- [Termix SSH](https://github.com/Termix-SSH/Termix) - Modern SSH client manager
- Built with Node.js, Express, and vanilla JavaScript
