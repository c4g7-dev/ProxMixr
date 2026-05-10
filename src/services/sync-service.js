const ProxmoxClient = require('../clients/proxmox-client');
const TermixClient = require('../clients/termix-client');
const { checkMultipleHosts } = require('../utils/ssh-checker');

class SyncService {
  constructor(config) {
    this.config = config;
    this.proxmoxClient = null;
    this.termixClient = null;
  }

  /**
   * Initialize clients with current configuration
   */
  initializeClients() {
    this.initializeProxmoxClient();
    this.initializeTermixClient();
  }

  /**
   * Initialize only Proxmox client
   */
  initializeProxmoxClient() {
    if (!this.config.proxmox) {
      throw new Error('Proxmox configuration required');
    }

    this.proxmoxClient = new ProxmoxClient({
      url: this.config.proxmox.url,
      username: this.config.proxmox.username,
      password: this.config.proxmox.password,
      tokenId: this.config.proxmox.tokenId,
      tokenSecret: this.config.proxmox.tokenSecret
    });
  }

  /**
   * Initialize only Termix client
   */
  initializeTermixClient() {
    if (!this.config.termix) {
      throw new Error('Termix configuration required');
    }

    this.termixClient = new TermixClient({
      url: this.config.termix.url,
      apiKey: this.config.termix.apiKey
    });
  }

  /**
   * Perform full sync from Proxmox to Termix
   * @param {Object} options - Sync options
   */
  async performSync(options = {}) {
    const {
      checkSSH = true,
      sshTimeout = 3000,
      username = 'root',
      password = '',
      folder = 'Proxmox',
      tags = [],
      authType = 'password',
      keyId = null
    } = options;

    this.initializeClients();

    const syncLog = {
      startTime: new Date().toISOString(),
      endTime: null,
      status: 'running',
      steps: []
    };

    try {
      // Step 1: Fetch all VMs from Proxmox
      syncLog.steps.push({
        step: 'fetch_proxmox_vms',
        status: 'running',
        timestamp: new Date().toISOString()
      });

      const vms = await this.proxmoxClient.getAllVirtualMachines();

      syncLog.steps[syncLog.steps.length - 1].status = 'completed';
      syncLog.steps[syncLog.steps.length - 1].result = {
        total: vms.length,
        withIP: vms.filter(vm => vm.ip).length,
        withoutIP: vms.filter(vm => !vm.ip).length
      };

      // Step 2: Check SSH availability if enabled
      let vmsToSync = vms.filter(vm => vm.ip);

      if (checkSSH && vmsToSync.length > 0) {
        syncLog.steps.push({
          step: 'check_ssh_availability',
          status: 'running',
          timestamp: new Date().toISOString()
        });

        const hostsWithSSHCheck = await checkMultipleHosts(
          vmsToSync.map(vm => ({ ip: vm.ip, name: vm.name })),
          sshTimeout
        );

        // Filter only VMs with SSH available
        const sshAvailableIPs = new Set(
          hostsWithSSHCheck
            .filter(h => h.sshAvailable)
            .map(h => h.ip)
        );

        vmsToSync = vmsToSync.filter(vm => sshAvailableIPs.has(vm.ip));

        syncLog.steps[syncLog.steps.length - 1].status = 'completed';
        syncLog.steps[syncLog.steps.length - 1].result = {
          checked: hostsWithSSHCheck.length,
          sshAvailable: vmsToSync.length,
          sshUnavailable: hostsWithSSHCheck.length - vmsToSync.length
        };
      }

      // Step 3: Sync to Termix
      syncLog.steps.push({
        step: 'sync_to_termix',
        status: 'running',
        timestamp: new Date().toISOString()
      });

      const syncResult = await this.termixClient.syncFromProxmox(vmsToSync, {
        username,
        password,
        folder,
        tags,
        authType,
        keyId
      });

      syncLog.steps[syncLog.steps.length - 1].status = 'completed';
      syncLog.steps[syncLog.steps.length - 1].result = syncResult;

      // Finalize log
      syncLog.endTime = new Date().toISOString();
      syncLog.status = 'completed';
      syncLog.summary = {
        totalVMs: vms.length,
        synced: syncResult.imported,
        skipped: syncResult.skipped,
        success: syncResult.success
      };

      return syncLog;

    } catch (error) {
      syncLog.endTime = new Date().toISOString();
      syncLog.status = 'failed';
      syncLog.error = error.message;

      if (syncLog.steps.length > 0) {
        const lastStep = syncLog.steps[syncLog.steps.length - 1];
        if (lastStep.status === 'running') {
          lastStep.status = 'failed';
          lastStep.error = error.message;
        }
      }

      throw error;
    }
  }

  /**
   * Get preview of what would be synced without actually syncing
   */
  async getPreview(options = {}) {
    const {
      checkSSH = true,
      sshTimeout = 3000
    } = options;

    this.initializeClients();

    // Fetch all VMs
    const vms = await this.proxmoxClient.getAllVirtualMachines();

    // Separate VMs with and without IPs
    const vmsWithIP = vms.filter(vm => vm.ip);
    const vmsWithoutIP = vms.filter(vm => !vm.ip);

    let sshCheckResults = null;

    if (checkSSH && vmsWithIP.length > 0) {
      const hostsWithSSHCheck = await checkMultipleHosts(
        vmsWithIP.map(vm => ({ ip: vm.ip, name: vm.name, vmid: vm.vmid })),
        sshTimeout
      );

      sshCheckResults = hostsWithSSHCheck.map(host => {
        const vm = vmsWithIP.find(v => v.ip === host.ip);
        return {
          ...host,
          vmid: vm.vmid,
          type: vm.type,
          node: vm.node
        };
      });
    }

    return {
      total: vms.length,
      vmsWithIP: vmsWithIP.length,
      vmsWithoutIP: vmsWithoutIP.length,
      vms: vms.map(vm => ({
        vmid: vm.vmid,
        name: vm.name,
        type: vm.type,
        node: vm.node,
        ip: vm.ip,
        status: vm.status,
        willSync: vm.ip ? true : false
      })),
      sshCheck: sshCheckResults,
      vmsWithoutIPList: vmsWithoutIP.map(vm => ({
        vmid: vm.vmid,
        name: vm.name,
        type: vm.type,
        node: vm.node
      }))
    };
  }

  /**
   * Test connection to Proxmox
   */
  async testProxmoxConnection() {
    try {
      this.initializeProxmoxClient();
      const nodes = await this.proxmoxClient.getNodes();
      return {
        success: true,
        message: 'Connected to Proxmox successfully',
        nodes: nodes.length,
        nodeList: nodes.map(n => ({ name: n.node, status: n.status }))
      };
    } catch (error) {
      return {
        success: false,
        message: `Proxmox connection failed: ${error.message}`
      };
    }
  }

  /**
   * Test connection to Termix
   */
  async testTermixConnection() {
    try {
      this.initializeTermixClient();
      // Try to get hosts (or any API call) to verify connection
      const hosts = await this.termixClient.getHosts();
      return {
        success: true,
        message: 'Connected to Termix successfully',
        existingHosts: Array.isArray(hosts) ? hosts.length : 0
      };
    } catch (error) {
      return {
        success: false,
        message: `Termix connection failed: ${error.message}`
      };
    }
  }
}

module.exports = SyncService;
