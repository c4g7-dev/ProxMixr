const fs = require('fs');
const path = require('path');

class ConfigStore {
  constructor(dataDir = null) {
    const defaultDir = path.join(__dirname, '../../data');
    this.dataDir = dataDir || defaultDir;
    this.configFile = path.join(this.dataDir, 'config.json');
    this.historyFile = path.join(this.dataDir, 'history.json');

    this.ensureDataDirectory();
    this.config = this.loadConfig();
    this.history = this.loadHistory();
  }

  /**
   * Ensure data directory exists
   */
  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Load configuration from file
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load config:', error.message);
    }
    return {};
  }

  /**
   * Save configuration to file
   */
  saveConfig() {
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to save config:', error.message);
      throw error;
    }
  }

  /**
   * Load history from file
   */
  loadHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        const data = fs.readFileSync(this.historyFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load history:', error.message);
    }
    return [];
  }

  /**
   * Save history to file
   */
  saveHistory() {
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to save history:', error.message);
      throw error;
    }
  }

  /**
   * Set a configuration value
   */
  set(key, value) {
    this.config[key] = value;
    this.config[`${key}_updated_at`] = new Date().toISOString();
    this.saveConfig();
  }

  /**
   * Get a configuration value
   */
  get(key, defaultValue = null) {
    return this.config.hasOwnProperty(key) ? this.config[key] : defaultValue;
  }

  /**
   * Get all configuration
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * Delete a configuration value
   */
  delete(key) {
    delete this.config[key];
    delete this.config[`${key}_updated_at`];
    this.saveConfig();
  }

  /**
   * Get complete configuration for sync service
   */
  getSyncConfig() {
    return {
      proxmox: {
        url: this.get('proxmox_url'),
        username: this.get('proxmox_username'),
        password: this.get('proxmox_password'),
        tokenId: this.get('proxmox_token_id'),
        tokenSecret: this.get('proxmox_token_secret')
      },
      termix: {
        url: this.get('termix_url'),
        apiKey: this.get('termix_api_key')
      },
      sync: {
        defaultUsername: this.get('ssh_default_username', 'root'),
        defaultPassword: this.get('ssh_default_password', ''),
        defaultFolder: this.get('termix_default_folder', 'Proxmox'),
        defaultTags: this.get('termix_default_tags', []),
        checkSSH: this.get('sync_check_ssh', true),
        sshTimeout: this.get('sync_ssh_timeout', 3000),
        authType: this.get('ssh_auth_type', 'password'),
        keyId: this.get('ssh_key_id', null),
        useNestedFolders: this.get('sync_use_nested_folders', true)
      }
    };
  }

  /**
   * Save sync configuration
   */
  saveSyncConfig(config) {
    if (config.proxmox) {
      if (config.proxmox.url) this.set('proxmox_url', config.proxmox.url);
      if (config.proxmox.username) this.set('proxmox_username', config.proxmox.username);
      if (config.proxmox.password !== undefined) this.set('proxmox_password', config.proxmox.password);
      if (config.proxmox.tokenId !== undefined) this.set('proxmox_token_id', config.proxmox.tokenId);
      if (config.proxmox.tokenSecret !== undefined) this.set('proxmox_token_secret', config.proxmox.tokenSecret);
    }

    if (config.termix) {
      if (config.termix.url) this.set('termix_url', config.termix.url);
      if (config.termix.apiKey) this.set('termix_api_key', config.termix.apiKey);
    }

    if (config.sync) {
      if (config.sync.defaultUsername) this.set('ssh_default_username', config.sync.defaultUsername);
      if (config.sync.defaultPassword !== undefined) this.set('ssh_default_password', config.sync.defaultPassword);
      if (config.sync.defaultFolder) this.set('termix_default_folder', config.sync.defaultFolder);
      if (config.sync.defaultTags) this.set('termix_default_tags', config.sync.defaultTags);
      if (config.sync.checkSSH !== undefined) this.set('sync_check_ssh', config.sync.checkSSH);
      if (config.sync.sshTimeout) this.set('sync_ssh_timeout', config.sync.sshTimeout);
      if (config.sync.authType) this.set('ssh_auth_type', config.sync.authType);
      if (config.sync.keyId !== undefined) this.set('ssh_key_id', config.sync.keyId);
      if (config.sync.useNestedFolders !== undefined) this.set('sync_use_nested_folders', config.sync.useNestedFolders);
    }
  }

  /**
   * Add sync history entry
   */
  addSyncHistory(syncLog) {
    const entry = {
      id: this.history.length + 1,
      started_at: syncLog.startTime,
      completed_at: syncLog.endTime,
      status: syncLog.status,
      total_vms: syncLog.summary?.totalVMs || 0,
      synced: syncLog.summary?.synced || 0,
      skipped: syncLog.summary?.skipped || 0,
      error: syncLog.error || null,
      log: syncLog
    };

    this.history.unshift(entry); // Add to beginning

    // Keep only last 100 entries
    if (this.history.length > 100) {
      this.history = this.history.slice(0, 100);
    }

    this.saveHistory();
  }

  /**
   * Get sync history
   */
  getSyncHistory(limit = 50) {
    return this.history.slice(0, limit);
  }

  /**
   * Close (no-op for file-based storage, kept for compatibility)
   */
  close() {
    // No-op for file-based storage
  }
}

module.exports = ConfigStore;
