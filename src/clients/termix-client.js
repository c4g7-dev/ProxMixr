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
   * Import hosts using Termix bulk import API
   * @param {Array} hosts - Array of host objects in Termix format
   */
  async importHosts(hosts) {
    try {
      const response = await this.client.post('/host/bulk-import', {
        hosts: hosts,
        overwrite: false
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
      const response = await this.client.get('/host/db/host');
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
      const response = await this.client.delete(`/host/db/host/${hostId}`);
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
      const response = await this.client.put(`/host/db/host/${hostId}`, hostData);
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
      keyId = null,
      useNestedFolders = true
    } = options;

    // Create nested folder structure: Proxmox/NodeName
    const finalFolder = `${folder}/${vm.node}`;

    const host = {
      name: vm.name || `VM-${vm.vmid}`,
      ip: vm.ip,
      port: 22,
      username: username,
      folder: finalFolder,
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
    } else if (authType === 'credential' && keyId) {
      host.authType = 'credential';
      host.credentialId = parseInt(keyId);
    } else {
      // For 'none' or when no auth is provided, let Termix handle it
      // Don't set authType - Termix will prompt for credentials when connecting
      delete host.authType;
      delete host.password;
      delete host.credentialId;
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
      replaceExisting = false,
      useNestedFolders = true
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
        keyId,
        useNestedFolders
      })
    );

    try {
      // Import to Termix
      console.log(`[Termix] Attempting to import ${hosts.length} hosts to Termix`);
      console.log(`[Termix] Sample host:`, JSON.stringify(hosts[0], null, 2));

      const result = await this.importHosts(hosts);

      console.log(`[Termix] Import result:`, JSON.stringify(result, null, 2));

      return {
        success: true,
        message: `Successfully synced ${hosts.length} hosts to Termix`,
        imported: hosts.length,
        skipped: vms.length - vmsWithIP.length,
        details: result
      };
    } catch (error) {
      console.error(`[Termix] Import failed:`, error.message);
      console.error(`[Termix] Error details:`, error);

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
