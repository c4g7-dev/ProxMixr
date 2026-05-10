const axios = require('axios');
const https = require('https');

class ProxmoxClient {
  constructor(config) {
    if (!config.url) {
      throw new Error('Proxmox URL is required');
    }
    if (!config.username && !config.tokenId) {
      throw new Error('Proxmox username or token ID is required');
    }

    this.baseUrl = config.url;
    this.username = config.username;
    this.password = config.password;
    this.tokenId = config.tokenId;
    this.tokenSecret = config.tokenSecret;
    this.ticket = null;
    this.csrfToken = null;

    // Create axios instance with SSL verification disabled (common for self-signed certs)
    this.client = axios.create({
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });
  }

  /**
   * Authenticate with Proxmox using username/password
   */
  async authenticate() {
    if (this.tokenId && this.tokenSecret) {
      // Using API token, no need to authenticate
      return;
    }

    try {
      const response = await this.client.post(
        `${this.baseUrl}/api2/json/access/ticket`,
        `username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.ticket = response.data.data.ticket;
      this.csrfToken = response.data.data.CSRFPreventionToken;
    } catch (error) {
      throw new Error(`Proxmox authentication failed: ${error.message}`);
    }
  }

  /**
   * Get authorization headers
   */
  getAuthHeaders() {
    if (this.tokenId && this.tokenSecret) {
      return {
        'Authorization': `PVEAPIToken=${this.tokenId}=${this.tokenSecret}`
      };
    } else {
      return {
        'Cookie': `PVEAuthCookie=${this.ticket}`,
        'CSRFPreventionToken': this.csrfToken
      };
    }
  }

  /**
   * Get all cluster nodes
   */
  async getNodes() {
    if (!this.tokenId && !this.ticket) {
      await this.authenticate();
    }

    try {
      const response = await this.client.get(
        `${this.baseUrl}/api2/json/nodes`,
        { headers: this.getAuthHeaders() }
      );

      return response.data.data;
    } catch (error) {
      throw new Error(`Failed to get nodes: ${error.message}`);
    }
  }

  /**
   * Get all VMs and LXCs from a specific node
   */
  async getVirtualMachines(node) {
    if (!this.tokenId && !this.ticket) {
      await this.authenticate();
    }

    try {
      const headers = this.getAuthHeaders();

      // Get QEMU VMs
      const vmsResponse = await this.client.get(
        `${this.baseUrl}/api2/json/nodes/${node}/qemu`,
        { headers }
      );

      // Get LXC containers
      const lxcResponse = await this.client.get(
        `${this.baseUrl}/api2/json/nodes/${node}/lxc`,
        { headers }
      );

      const vms = vmsResponse.data.data.map(vm => ({
        ...vm,
        type: 'qemu',
        node
      }));

      const lxcs = lxcResponse.data.data.map(lxc => ({
        ...lxc,
        type: 'lxc',
        node
      }));

      return [...vms, ...lxcs];
    } catch (error) {
      throw new Error(`Failed to get VMs for node ${node}: ${error.message}`);
    }
  }

  /**
   * Get network configuration for a VM/LXC
   */
  async getNetworkConfig(node, vmid, type) {
    if (!this.tokenId && !this.ticket) {
      await this.authenticate();
    }

    try {
      const response = await this.client.get(
        `${this.baseUrl}/api2/json/nodes/${node}/${type}/${vmid}/config`,
        { headers: this.getAuthHeaders() }
      );

      return response.data.data;
    } catch (error) {
      console.error(`Failed to get network config for ${vmid}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get IP address from agent (if QEMU guest agent is running)
   */
  async getAgentNetworkInfo(node, vmid, type) {
    if (type !== 'qemu') return null;

    try {
      const response = await this.client.get(
        `${this.baseUrl}/api2/json/nodes/${node}/qemu/${vmid}/agent/network-get-interfaces`,
        { headers: this.getAuthHeaders() }
      );

      const interfaces = response.data.data.result;

      // Find first non-loopback interface with IPv4
      for (const iface of interfaces) {
        if (iface.name !== 'lo' && iface['ip-addresses']) {
          const ipv4 = iface['ip-addresses'].find(ip => ip['ip-address-type'] === 'ipv4');
          if (ipv4 && !ipv4['ip-address'].startsWith('127.')) {
            return ipv4['ip-address'];
          }
        }
      }

      return null;
    } catch (error) {
      // Agent might not be installed or running
      return null;
    }
  }

  /**
   * Get all VMs/LXCs from all nodes with network information
   */
  async getAllVirtualMachines() {
    const nodes = await this.getNodes();
    const allVMs = [];

    for (const node of nodes) {
      if (node.status !== 'online') continue;

      const vms = await this.getVirtualMachines(node.node);

      for (const vm of vms) {
        // Skip if not running
        if (vm.status !== 'running') continue;

        let ip = null;

        // Method 1: Try to get IP from agent first (QEMU only)
        if (vm.type === 'qemu') {
          ip = await this.getAgentNetworkInfo(node.node, vm.vmid, vm.type);
        }

        // Method 2: Try to get IP from agent/lxc status
        if (!ip && vm.type === 'lxc') {
          ip = await this.getLXCIPFromStatus(node.node, vm.vmid);
        }

        // Method 3: Try to parse from config
        if (!ip) {
          const config = await this.getNetworkConfig(node.node, vm.vmid, vm.type);
          if (config) {
            ip = this.extractIPFromConfig(config, vm.type);
          }
        }

        // Method 4: Try to get from current status/interfaces
        if (!ip) {
          ip = await this.getIPFromInterfaces(node.node, vm.vmid, vm.type);
        }

        allVMs.push({
          vmid: vm.vmid,
          name: vm.name,
          status: vm.status,
          type: vm.type,
          node: vm.node,
          ip: ip || null,
          maxmem: vm.maxmem,
          cpus: vm.cpus
        });
      }
    }

    return allVMs;
  }

  /**
   * Get LXC IP from status API
   */
  async getLXCIPFromStatus(node, vmid) {
    try {
      const response = await this.client.get(
        `${this.baseUrl}/api2/json/nodes/${node}/lxc/${vmid}/status/current`,
        { headers: this.getAuthHeaders() }
      );

      const status = response.data.data;

      // Check if there's network info in status
      if (status && status.network) {
        for (const [key, value] of Object.entries(status.network)) {
          if (key.startsWith('eth') && value.inet) {
            // Extract IP from CIDR format (e.g., "10.27.27.185/24")
            const match = value.inet.match(/^([0-9.]+)/);
            if (match) return match[1];
          }
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get IP from network interfaces
   */
  async getIPFromInterfaces(node, vmid, type) {
    try {
      if (type === 'lxc') {
        // Try to get from LXC interfaces
        const response = await this.client.get(
          `${this.baseUrl}/api2/json/nodes/${node}/lxc/${vmid}/interfaces`,
          { headers: this.getAuthHeaders() }
        );

        const interfaces = response.data.data;

        for (const iface of interfaces) {
          if (iface.name && iface.name !== 'lo' && iface.inet) {
            // Extract IP from CIDR
            const match = iface.inet.match(/^([0-9.]+)/);
            if (match && !match[1].startsWith('127.')) {
              return match[1];
            }
          }
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract IP address from VM/LXC configuration
   */
  extractIPFromConfig(config, type) {
    // For LXC containers
    if (type === 'lxc') {
      // Check net0, net1, etc.
      for (let i = 0; i < 10; i++) {
        const netKey = `net${i}`;
        if (config[netKey]) {
          // Try multiple formats:
          // - ip=10.27.27.185/24
          // - ip=10.27.27.185
          // - name=eth0,bridge=vmbr0,ip=10.27.27.185/24
          const match = config[netKey].match(/ip=([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/);
          if (match && !match[1].startsWith('127.')) {
            return match[1];
          }
        }
      }
    }

    // For QEMU VMs
    if (type === 'qemu') {
      // Check ipconfig0, ipconfig1, etc.
      for (let i = 0; i < 10; i++) {
        const ipconfigKey = `ipconfig${i}`;
        if (config[ipconfigKey]) {
          // Try multiple formats:
          // - ip=10.27.27.185/24,gw=10.27.27.1
          // - ip=dhcp
          const match = config[ipconfigKey].match(/ip=([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/);
          if (match && !match[1].startsWith('127.')) {
            return match[1];
          }
        }
      }
    }

    return null;
  }
}

module.exports = ProxmoxClient;
