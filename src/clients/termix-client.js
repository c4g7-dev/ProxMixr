const axios = require('axios');

class TermixClient {
  constructor(config) {
    if (!config.url) {
      throw new Error('Termix URL is required');
    }
    if (!config.apiKey) {
      throw new Error('Termix API key is required');
    }

    this.baseUrl = config.url.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = config.apiKey;

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Import hosts using JSON import format
   * @param {Array} hosts - Array of host objects in Termix format
   */
  async importHosts(hosts) {
    try {
      const response = await this.client.post('/api/hosts/import', {
        hosts: hosts
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`Termix import failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Termix import failed: ${error.message}`);
    }
  }

  /**
   * Get all existing hosts from Termix
   */
  async getHosts() {
    try {
      const response = await this.client.get('/api/hosts');
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`Failed to get Termix hosts: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Failed to get Termix hosts: ${error.message}`);
    }
  }

  /**
   * Delete a host by ID
   * @param {string|number} hostId - Host ID to delete
   */
  async deleteHost(hostId) {
    try {
      const response = await this.client.delete(`/api/hosts/${hostId}`);
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`Failed to delete host: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Failed to delete host: ${error.message}`);
    }
  }

  /**
   * Update a host
   * @param {string|number} hostId - Host ID to update
   * @param {Object} hostData - Host data to update
   */
  async updateHost(hostId, hostData) {
    try {
      const response = await this.client.put(`/api/hosts/${hostId}`, hostData);
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`Failed to update host: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Failed to update host: ${error.message}`);
    }
  }

  /**
   * Create a Termix host object from Proxmox VM data
   * @param {Object} vm - Proxmox VM data
   * @param {Object} options - Additional options (username, password, folder, tags)
   */
  static createHostFromProxmoxVM(vm, options = {}) {
    const {
      username = 'root',
      password = '',
      folder = 'Proxmox',
      tags = [],
      authType = 'password',
      keyId = null
    } = options;

    const host = {
      name: vm.name || `VM-${vm.vmid}`,
      ip: vm.ip,
      port: 22,
      username: username,
      folder: folder,
      tags: [
        'proxmox',
        vm.type,
        `node:${vm.node}`,
        ...tags
      ],
      notes: `Proxmox ${vm.type.toUpperCase()} - VMID: ${vm.vmid}\nNode: ${vm.node}\nStatus: ${vm.status}`,
      enableTerminal: true,
      enableFileManager: true
    };

    // Add authentication based on type
    if (authType === 'password' && password) {
      host.authType = 'password';
      host.password = password;
    } else if (authType === 'key' && keyId) {
      host.authType = 'credential';
      host.credentialId = keyId;
    } else {
      // Default to password auth but empty (user will need to configure)
      host.authType = 'password';
      host.password = '';
    }

    return host;
  }

  /**
   * Sync Proxmox VMs to Termix
   * @param {Array} vms - Array of Proxmox VMs with IP addresses
   * @param {Object} options - Sync options
   */
  async syncFromProxmox(vms, options = {}) {
    const {
      username = 'root',
      password = '',
      folder = 'Proxmox',
      tags = [],
      authType = 'password',
      keyId = null,
      replaceExisting = false
    } = options;

    // Filter VMs that have IP addresses
    const vmsWithIP = vms.filter(vm => vm.ip);

    if (vmsWithIP.length === 0) {
      return {
        success: false,
        message: 'No VMs with IP addresses found',
        imported: 0,
        skipped: vms.length
      };
    }

    // Create Termix host objects
    const hosts = vmsWithIP.map(vm =>
      TermixClient.createHostFromProxmoxVM(vm, {
        username,
        password,
        folder,
        tags,
        authType,
        keyId
      })
    );

    try {
      // Import to Termix
      const result = await this.importHosts(hosts);

      return {
        success: true,
        message: `Successfully synced ${hosts.length} hosts to Termix`,
        imported: hosts.length,
        skipped: vms.length - vmsWithIP.length,
        details: result
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        imported: 0,
        skipped: vms.length
      };
    }
  }
}

module.exports = TermixClient;
