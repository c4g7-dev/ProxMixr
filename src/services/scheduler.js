const cron = require('node-cron');

class SyncScheduler {
  constructor(syncService, configStore) {
    this.syncService = syncService;
    this.configStore = configStore;
    this.currentTask = null;
    this.isRunning = false;
    this.lastSync = null;
    this.nextSync = null;
  }

  /**
   * Start the scheduler with given interval
   * @param {number} intervalMinutes - Interval in minutes
   */
  start(intervalMinutes) {
    if (this.currentTask) {
      this.stop();
    }

    if (!intervalMinutes || intervalMinutes <= 0) {
      console.log('[Scheduler] Invalid interval, scheduler not started');
      return;
    }

    // Convert minutes to cron expression
    const cronExpression = `*/${intervalMinutes} * * * *`;

    console.log(`[Scheduler] Starting sync scheduler: every ${intervalMinutes} minutes`);

    this.currentTask = cron.schedule(cronExpression, async () => {
      await this.runSync();
    });

    this.updateNextSyncTime(intervalMinutes);
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.currentTask) {
      this.currentTask.stop();
      this.currentTask = null;
      this.nextSync = null;
      console.log('[Scheduler] Sync scheduler stopped');
    }
  }

  /**
   * Check if scheduler is active
   */
  isActive() {
    return this.currentTask !== null;
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      active: this.isActive(),
      running: this.isRunning,
      lastSync: this.lastSync,
      nextSync: this.nextSync
    };
  }

  /**
   * Update next sync time
   */
  updateNextSyncTime(intervalMinutes) {
    if (intervalMinutes && intervalMinutes > 0) {
      const next = new Date();
      next.setMinutes(next.getMinutes() + intervalMinutes);
      this.nextSync = next.toISOString();
    }
  }

  /**
   * Run sync with change detection
   */
  async runSync() {
    if (this.isRunning) {
      console.log('[Scheduler] Sync already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('[Scheduler] Starting scheduled sync...');

    try {
      const config = this.configStore.getSyncConfig();

      // Get current VMs to detect changes
      await this.syncService.initializeProxmoxClient();
      const currentVMs = await this.syncService.proxmoxClient.getAllVirtualMachines();

      // Check if there are new VMs since last sync
      const lastSyncData = this.configStore.get('last_sync_vms', []);
      const newVMs = this.detectNewVMs(currentVMs, lastSyncData);

      if (newVMs.length > 0) {
        console.log(`[Scheduler] Detected ${newVMs.length} new VMs/LXCs, running sync...`);
      } else {
        console.log('[Scheduler] No new VMs detected, running regular sync...');
      }

      // Perform sync
      const syncOptions = {
        checkSSH: config.sync.checkSSH,
        sshTimeout: config.sync.sshTimeout,
        username: config.sync.defaultUsername,
        password: config.sync.defaultPassword,
        folder: config.sync.defaultFolder,
        tags: config.sync.defaultTags,
        authType: config.sync.authType,
        keyId: config.sync.keyId,
        useNestedFolders: config.sync.useNestedFolders
      };

      const result = await this.syncService.performSync(syncOptions);

      // Save to history with scheduler flag
      result.scheduled = true;
      result.newVMsDetected = newVMs.length;
      this.configStore.addSyncHistory(result);

      // Update last sync data
      this.configStore.set('last_sync_vms', currentVMs.map(vm => ({
        vmid: vm.vmid,
        node: vm.node,
        type: vm.type,
        name: vm.name
      })));

      this.lastSync = new Date().toISOString();

      // Update next sync time
      const intervalMinutes = this.configStore.get('sync_interval_minutes', 30);
      this.updateNextSyncTime(intervalMinutes);

      console.log(`[Scheduler] Sync completed: ${result.summary.synced} synced, ${result.summary.skipped} skipped`);
    } catch (error) {
      console.error('[Scheduler] Sync failed:', error.message);

      // Save failed sync to history
      const failedLog = {
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        status: 'failed',
        error: error.message,
        scheduled: true,
        steps: []
      };
      this.configStore.addSyncHistory(failedLog);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Detect new VMs that weren't in last sync
   */
  detectNewVMs(currentVMs, lastSyncVMs) {
    const lastVMIds = new Set(lastSyncVMs.map(vm => `${vm.node}-${vm.vmid}`));
    return currentVMs.filter(vm => !lastVMIds.has(`${vm.node}-${vm.vmid}`));
  }
}

module.exports = SyncScheduler;
