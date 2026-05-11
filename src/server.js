const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const ConfigStore = require('./db/config-store');
const SyncService = require('./services/sync-service');
const SyncScheduler = require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize config store
const configStore = new ConfigStore();

// Initialize scheduler (will be started when configured)
let scheduler = null;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ============== API Routes ==============

/**
 * Get current configuration
 */
app.get('/api/config', (req, res) => {
  try {
    const config = configStore.getSyncConfig();

    // Don't send sensitive data to client
    const safeConfig = {
      proxmox: {
        url: config.proxmox.url,
        username: config.proxmox.username,
        hasPassword: !!config.proxmox.password,
        hasTokenId: !!config.proxmox.tokenId,
        hasTokenSecret: !!config.proxmox.tokenSecret
      },
      termix: {
        url: config.termix.url,
        hasApiKey: !!config.termix.apiKey
      },
      sync: config.sync
    };

    res.json(safeConfig);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update configuration
 */
app.post('/api/config', (req, res) => {
  try {
    configStore.saveSyncConfig(req.body);
    res.json({ success: true, message: 'Configuration saved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Test Proxmox connection
 */
app.post('/api/test/proxmox', async (req, res) => {
  try {
    const config = configStore.getSyncConfig();
    const syncService = new SyncService(config);
    const result = await syncService.testProxmoxConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Connection test failed: ${error.message}`
    });
  }
});

/**
 * Test Termix connection
 */
app.post('/api/test/termix', async (req, res) => {
  try {
    const config = configStore.getSyncConfig();
    const syncService = new SyncService(config);
    const result = await syncService.testTermixConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Connection test failed: ${error.message}`
    });
  }
});

/**
 * Get sync preview
 */
app.get('/api/sync/preview', async (req, res) => {
  try {
    const config = configStore.getSyncConfig();
    const syncService = new SyncService(config);

    const checkSSH = req.query.checkSSH !== 'false';
    const preview = await syncService.getPreview({
      checkSSH,
      sshTimeout: config.sync.sshTimeout
    });

    res.json(preview);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Perform sync
 */
app.post('/api/sync', async (req, res) => {
  try {
    const config = configStore.getSyncConfig();
    const syncService = new SyncService(config);

    const syncOptions = {
      checkSSH: req.body.checkSSH !== undefined ? req.body.checkSSH : config.sync.checkSSH,
      sshTimeout: config.sync.sshTimeout,
      username: req.body.username || config.sync.defaultUsername,
      password: req.body.password || config.sync.defaultPassword,
      folder: req.body.folder || config.sync.defaultFolder,
      tags: req.body.tags || config.sync.defaultTags,
      authType: req.body.authType || config.sync.authType,
      keyId: req.body.keyId || config.sync.keyId,
      useNestedFolders: req.body.useNestedFolders !== undefined ? req.body.useNestedFolders : config.sync.useNestedFolders
    };

    const result = await syncService.performSync(syncOptions);

    // Save to history
    configStore.addSyncHistory(result);

    res.json(result);
  } catch (error) {
    // Save failed sync to history
    const failedLog = {
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      status: 'failed',
      error: error.message,
      steps: []
    };
    configStore.addSyncHistory(failedLog);

    res.status(500).json({ error: error.message });
  }
});

/**
 * Get sync history
 */
app.get('/api/sync/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = configStore.getSyncHistory(limit);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * List all Proxmox hosts in Termix (tagged with 'proxmox')
 */
app.get('/api/cleanup/list', async (req, res) => {
  try {
    const config = configStore.getSyncConfig();
    const syncService = new SyncService(config);
    syncService.initializeTermixClient();

    const allHosts = await syncService.termixClient.getHosts();

    // Filter hosts that have 'proxmox' tag
    const proxmoxHosts = (allHosts.data || allHosts || []).filter(host =>
      host.tags && host.tags.includes('proxmox')
    );

    res.json({
      total: proxmoxHosts.length,
      hosts: proxmoxHosts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Remove all Proxmox hosts from Termix
 */
app.delete('/api/cleanup/remove-all', async (req, res) => {
  try {
    const config = configStore.getSyncConfig();
    const syncService = new SyncService(config);
    syncService.initializeTermixClient();

    const allHosts = await syncService.termixClient.getHosts();

    // Filter hosts that have 'proxmox' tag
    const proxmoxHosts = (allHosts.data || allHosts || []).filter(host =>
      host.tags && host.tags.includes('proxmox')
    );

    const results = {
      attempted: proxmoxHosts.length,
      removed: 0,
      failed: 0,
      errors: []
    };

    // Delete each host
    for (const host of proxmoxHosts) {
      try {
        await syncService.termixClient.deleteHost(host.id);
        results.removed++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Failed to delete ${host.name}: ${error.message}`);
      }
    }

    res.json({
      success: results.failed === 0,
      message: `Removed ${results.removed} out of ${results.attempted} hosts`,
      ...results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get scheduler status
 */
app.get('/api/scheduler/status', (req, res) => {
  if (!scheduler) {
    return res.json({ active: false, running: false, lastSync: null, nextSync: null });
  }
  res.json(scheduler.getStatus());
});

/**
 * Start/update scheduler
 */
app.post('/api/scheduler/start', (req, res) => {
  try {
    const { intervalMinutes } = req.body;

    if (!intervalMinutes || intervalMinutes < 1) {
      return res.status(400).json({ error: 'Invalid interval. Must be at least 1 minute.' });
    }

    // Save interval to config
    configStore.set('sync_interval_minutes', intervalMinutes);
    configStore.set('sync_scheduler_enabled', true);

    // Initialize scheduler if needed
    const config = configStore.getSyncConfig();
    const syncService = new SyncService(config);

    if (!scheduler) {
      scheduler = new SyncScheduler(syncService, configStore);
    }

    scheduler.start(intervalMinutes);

    res.json({
      success: true,
      message: `Scheduler started: sync every ${intervalMinutes} minutes`,
      status: scheduler.getStatus()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Stop scheduler
 */
app.post('/api/scheduler/stop', (req, res) => {
  try {
    if (scheduler) {
      scheduler.stop();
    }

    configStore.set('sync_scheduler_enabled', false);

    res.json({ success: true, message: 'Scheduler stopped' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get detailed sync log by ID
 */
app.get('/api/sync/history/:id', (req, res) => {
  try {
    const history = configStore.getSyncHistory(100);
    const entry = history.find(h => h.id === parseInt(req.params.id));

    if (!entry) {
      return res.status(404).json({ error: 'Sync log not found' });
    }

    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get application status
 */
app.get('/api/status', (req, res) => {
  const config = configStore.getSyncConfig();

  const status = {
    version: '1.0.0',
    uptime: process.uptime(),
    configured: {
      proxmox: !!(config.proxmox.url && (config.proxmox.username || config.proxmox.tokenId)),
      termix: !!(config.termix.url && config.termix.apiKey)
    },
    ready: !!(
      config.proxmox.url &&
      (config.proxmox.username || config.proxmox.tokenId) &&
      config.termix.url &&
      config.termix.apiKey
    ),
    scheduler: scheduler ? scheduler.getStatus() : { active: false }
  };

  res.json(status);
});

// Serve index.html for all other routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║   ProxMixr - Mix Proxmox into Termix           ║
║   Running on http://localhost:${PORT}            ║
╚════════════════════════════════════════════════╝
  `);

  // Auto-start scheduler if enabled
  const schedulerEnabled = configStore.get('sync_scheduler_enabled', false);
  const intervalMinutes = configStore.get('sync_interval_minutes', 30);

  if (schedulerEnabled && intervalMinutes > 0) {
    try {
      const config = configStore.getSyncConfig();
      const syncService = new SyncService(config);
      scheduler = new SyncScheduler(syncService, configStore);
      scheduler.start(intervalMinutes);
      console.log(`[Scheduler] Auto-started: sync every ${intervalMinutes} minutes`);
    } catch (error) {
      console.error('[Scheduler] Failed to auto-start:', error.message);
    }
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, stopping scheduler and closing database...');
  if (scheduler) scheduler.stop();
  configStore.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, stopping scheduler and closing database...');
  if (scheduler) scheduler.stop();
  configStore.close();
  process.exit(0);
});
