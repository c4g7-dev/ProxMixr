// API Base URL
const API_BASE = window.location.origin;

// State
let currentConfig = null;

// Live Console Logger
class ConsoleLogger {
  constructor() {
    this.overlay = document.getElementById('consoleOverlay');
    this.body = document.getElementById('consoleBody');
    this.title = document.getElementById('consoleTitle');
    this.status = document.getElementById('consoleStatus');
    this.progressFill = document.getElementById('consoleProgressFill');
    this.progressText = document.getElementById('consoleProgressText');
    this.doneBtn = document.getElementById('consoleDone');
    this.closeBtn = document.getElementById('consoleClose');
    this.logs = [];

    this.closeBtn.onclick = () => this.hide();
    this.doneBtn.onclick = () => this.hide();
  }

  show(title = 'Sync in Progress') {
    this.title.textContent = title;
    this.body.innerHTML = '';
    this.logs = [];
    this.setProgress(0);
    this.overlay.classList.add('show');
    this.doneBtn.style.display = 'none';
  }

  hide() {
    this.overlay.classList.remove('show');
  }

  log(level, message) {
    const time = new Date().toLocaleTimeString();
    const logEl = document.createElement('div');
    logEl.className = 'console-log';
    logEl.innerHTML = `
      <span class="console-log-time">${time}</span>
      <span class="console-log-level ${level}">${level}</span>
      <span class="console-log-message">${message}</span>
    `;
    this.body.appendChild(logEl);
    this.body.scrollTop = this.body.scrollHeight;
    this.logs.push({ time, level, message });
  }

  info(message) { this.log('info', message); }
  success(message) { this.log('success', message); }
  error(message) { this.log('error', message); }
  warn(message) { this.log('warn', message); }

  setProgress(percent) {
    this.progressFill.style.width = `${percent}%`;
    this.progressText.textContent = `${Math.round(percent)}%`;
  }

  setStatus(status) {
    this.status.textContent = status;
  }

  complete(success = true) {
    this.setProgress(100);
    this.setStatus(success ? 'Completed' : 'Failed');
    this.doneBtn.style.display = 'block';
    if (success) {
      this.success('<span class="success-text">✓ Sync completed successfully!</span>');
    } else {
      this.error('<span class="error-text">✗ Sync failed</span>');
    }
  }
}

const logger = new ConsoleLogger();

// Utility Functions
function showResult(elementId, message, type = 'info') {
  const element = document.getElementById(elementId);
  element.className = `result-box show ${type}`;
  element.innerHTML = message;
}

function hideResult(elementId) {
  const element = document.getElementById(elementId);
  element.className = 'result-box';
}

function formatUptime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

// Tab Navigation
document.querySelectorAll('.tab-btn').forEach(button => {
  button.addEventListener('click', () => {
    const tabName = button.dataset.tab;

    // Update active states
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    button.classList.add('active');
    document.getElementById(tabName).classList.add('active');

    // Load data for specific tabs
    if (tabName === 'config') {
      loadConfiguration();
      loadSchedulerStatus();
    } else if (tabName === 'history') {
      // Auto-load history without showing result message
      loadHistorySilently();
    }
  });
});

// Load history silently (no toast message)
async function loadHistorySilently() {
  try {
    const response = await fetch(`${API_BASE}/api/sync/history`);
    const history = await response.json();

    if (history.length === 0) {
      document.getElementById('historyData').innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">No sync history found</p>';
      return;
    }

    let historyHTML = '';

    for (const entry of history) {
      const statusBadge = entry.status === 'completed'
        ? '<span class="badge success">Completed</span>'
        : '<span class="badge error">Failed</span>';

      const scheduledBadge = entry.log?.scheduled
        ? '<span class="badge info">Scheduled</span>'
        : '<span class="badge">Manual</span>';

      historyHTML += `
        <div class="card">
          <h3>Sync #${entry.id} ${statusBadge} ${scheduledBadge}</h3>
          <div class="status-grid">
            <div class="status-item">
              <span class="label">Started:</span>
              <span class="value">${new Date(entry.started_at).toLocaleString()}</span>
            </div>
            <div class="status-item">
              <span class="label">Total VMs:</span>
              <span class="value">${entry.total_vms || 0}</span>
            </div>
            <div class="status-item">
              <span class="label">Synced:</span>
              <span class="value success">${entry.synced || 0}</span>
            </div>
            <div class="status-item">
              <span class="label">Skipped:</span>
              <span class="value">${entry.skipped || 0}</span>
            </div>
          </div>
          ${entry.error ? `<div class="result-box show error" style="margin-top: 1rem;">${entry.error}</div>` : ''}
        </div>
      `;
    }

    document.getElementById('historyData').innerHTML = historyHTML;
  } catch (error) {
    console.error('Failed to load history:', error);
  }
}



// Proxmox Auth Method Toggle
document.querySelectorAll('input[name="proxmoxAuth"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    const passwordAuth = document.getElementById('proxmoxPasswordAuth');
    const tokenAuth = document.getElementById('proxmoxTokenAuth');

    if (e.target.value === 'password') {
      passwordAuth.style.display = 'block';
      tokenAuth.style.display = 'none';
    } else {
      passwordAuth.style.display = 'none';
      tokenAuth.style.display = 'block';
    }
  });
});

// Load System Status
async function loadSystemStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/status`);
    const status = await response.json();

    // Update status badge
    const statusBadge = document.getElementById('statusBadge');
    if (status.ready) {
      statusBadge.className = 'status-badge ready';
      statusBadge.textContent = 'Ready';
    } else {
      statusBadge.className = 'status-badge not-ready';
      statusBadge.textContent = 'Not Configured';
    }

    // Update status items
    document.getElementById('proxmoxStatus').textContent = status.configured.proxmox ? 'Configured' : 'Not Configured';
    document.getElementById('proxmoxStatus').className = status.configured.proxmox ? 'value success' : 'value error';

    document.getElementById('termixStatus').textContent = status.configured.termix ? 'Configured' : 'Not Configured';
    document.getElementById('termixStatus').className = status.configured.termix ? 'value success' : 'value error';

    document.getElementById('uptime').textContent = formatUptime(status.uptime);
  } catch (error) {
    console.error('Failed to load system status:', error);
  }
}

// Load Configuration
async function loadConfiguration() {
  try {
    const response = await fetch(`${API_BASE}/api/config`);
    currentConfig = await response.json();

    // Populate Proxmox fields
    document.getElementById('proxmoxUrl').value = currentConfig.proxmox.url || '';
    document.getElementById('proxmoxUsername').value = currentConfig.proxmox.username || '';

    // Populate Termix fields
    document.getElementById('termixUrl').value = currentConfig.termix.url || '';

    // Populate Sync fields
    document.getElementById('sshUsername').value = currentConfig.sync.defaultUsername || 'root';
    document.getElementById('sshPassword').value = currentConfig.sync.defaultPassword || '';
    document.getElementById('sshAuthType').value = currentConfig.sync.authType || 'password';
    document.getElementById('sshKeyId').value = currentConfig.sync.keyId || '';
    document.getElementById('termixFolder').value = currentConfig.sync.defaultFolder || 'Proxmox';
    document.getElementById('sshTimeout').value = currentConfig.sync.sshTimeout || 3000;
    document.getElementById('checkSSH').checked = currentConfig.sync.checkSSH !== false;
    document.getElementById('useNestedFolders').checked = currentConfig.sync.useNestedFolders !== false;

    // Update UI based on auth type
    updateAuthTypeUI();
  } catch (error) {
    showResult('configResult', `Failed to load configuration: ${error.message}`, 'error');
  }
}

// Save Configuration
document.getElementById('saveConfigBtn').addEventListener('click', async () => {
  const authMethod = document.querySelector('input[name="proxmoxAuth"]:checked').value;

  const config = {
    proxmox: {
      url: document.getElementById('proxmoxUrl').value
    },
    termix: {
      url: document.getElementById('termixUrl').value,
      apiKey: document.getElementById('termixApiKey').value || undefined
    },
    sync: {
      defaultUsername: document.getElementById('sshUsername').value,
      defaultPassword: document.getElementById('sshPassword').value,
      defaultFolder: document.getElementById('termixFolder').value,
      sshTimeout: parseInt(document.getElementById('sshTimeout').value),
      checkSSH: document.getElementById('checkSSH').checked,
      useNestedFolders: document.getElementById('useNestedFolders').checked,
      authType: document.getElementById('sshAuthType').value,
      keyId: document.getElementById('sshKeyId').value || null
    }
  };

  if (authMethod === 'password') {
    config.proxmox.username = document.getElementById('proxmoxUsername').value;
    config.proxmox.password = document.getElementById('proxmoxPassword').value || undefined;
    config.proxmox.tokenId = '';
    config.proxmox.tokenSecret = '';
  } else {
    config.proxmox.tokenId = document.getElementById('proxmoxTokenId').value;
    config.proxmox.tokenSecret = document.getElementById('proxmoxTokenSecret').value || undefined;
    config.proxmox.username = '';
    config.proxmox.password = '';
  }

  try {
    const response = await fetch(`${API_BASE}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });

    const result = await response.json();

    if (result.success) {
      showResult('configResult', 'Configuration saved successfully!', 'success');
      loadSystemStatus();
    } else {
      showResult('configResult', `Failed to save: ${result.message}`, 'error');
    }
  } catch (error) {
    showResult('configResult', `Error: ${error.message}`, 'error');
  }
});

// Test Proxmox Connection
document.getElementById('testProxmoxBtn').addEventListener('click', async () => {
  const btn = document.getElementById('testProxmoxBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Testing...';

  try {
    const response = await fetch(`${API_BASE}/api/test/proxmox`, { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      showResult('actionResult', `✓ Connected! Found ${result.nodes} node(s): ${result.nodeList.map(n => `${n.name} (${n.status})`).join(', ')}`, 'success');
    } else {
      showResult('actionResult', `✗ ${result.message}`, 'error');
    }
  } catch (error) {
    showResult('actionResult', `✗ Error: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Proxmox Connection';
  }
});

// Test Termix Connection
document.getElementById('testTermixBtn').addEventListener('click', async () => {
  const btn = document.getElementById('testTermixBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Testing...';

  try {
    const response = await fetch(`${API_BASE}/api/test/termix`, { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      showResult('actionResult', `✓ Connected! Found ${result.existingHosts || 0} existing hosts`, 'success');
    } else {
      showResult('actionResult', `✗ ${result.message}`, 'error');
    }
  } catch (error) {
    showResult('actionResult', `✗ Error: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Termix Connection';
  }
});

// Sync Now with Live Console
document.getElementById('syncNowBtn').addEventListener('click', async () => {
  if (!confirm('Start sync now? This will add all Proxmox VMs/LXCs with SSH to Termix.')) {
    return;
  }

  const btn = document.getElementById('syncNowBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading loading-dots"></span>';

  // Show live console
  logger.show('Synchronizing Proxmox to Termix');
  logger.info('🚀 Starting synchronization process...');
  logger.setProgress(5);

  try {
    logger.info('📡 Connecting to Proxmox API...');
    logger.setProgress(10);

    // Load config first to get SSH check setting
    const configResponse = await fetch(`${API_BASE}/api/config`);
    const config = await configResponse.json();

    // Simulate getting preview first for realistic logging
    const previewResponse = await fetch(`${API_BASE}/api/sync/preview`);
    const preview = await previewResponse.json();

    logger.success(`Found <span class="highlight">${preview.total}</span> VMs/LXCs in Proxmox`);
    logger.info(`└─ <span class="highlight">${preview.vmsWithIP}</span> with IP addresses`);
    logger.info(`└─ <span class="highlight">${preview.vmsWithoutIP}</span> without IP (will skip)`);
    logger.setProgress(25);

    if (preview.sshCheck) {
      logger.info('🔍 Checking SSH availability on port 22...');
      const sshAvailable = preview.sshCheck.filter(h => h.sshAvailable).length;
      logger.success(`SSH responding on <span class="highlight">${sshAvailable}</span> hosts`);
      logger.setProgress(45);
    }

    logger.info('📦 Preparing host data for Termix...');
    logger.setProgress(60);

    // Perform actual sync with config values
    const response = await fetch(`${API_BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkSSH: config.sync.checkSSH
      })
    });

    const result = await response.json();
    logger.setProgress(80);

    if (result.status === 'completed') {
      logger.info('📤 Uploading to Termix API...');
      logger.setProgress(90);

      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for UX

      logger.success(`Added <span class="highlight">${result.summary.synced}</span> hosts to Termix`);
      if (result.summary.skipped > 0) {
        logger.warn(`Skipped <span class="highlight">${result.summary.skipped}</span> hosts`);
      }

      logger.complete(true);

      showResult('actionResult',
        `✓ Sync completed! ${result.summary.synced} hosts synced, ${result.summary.skipped} skipped`,
        'success'
      );
    } else {
      logger.error(`Sync failed: ${result.error}`);
      logger.complete(false);
      showResult('actionResult', `✗ Sync failed: ${result.error}`, 'error');
    }
  } catch (error) {
    logger.error(`Error: ${error.message}`);
    logger.complete(false);
    showResult('actionResult', `✗ Error: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sync Now';
  }
});

// Load Preview with Live Console
document.getElementById('loadPreviewBtn').addEventListener('click', async () => {
  const btn = document.getElementById('loadPreviewBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading loading-dots"></span>';

  // Show live console
  logger.show('Loading Sync Preview');
  logger.info('🚀 Starting preview scan...');
  logger.setProgress(5);

  try {
    logger.info('📡 Connecting to Proxmox API...');
    logger.setProgress(15);

    // Load config to get SSH check setting
    const configResponse = await fetch(`${API_BASE}/api/config`);
    const config = await configResponse.json();

    logger.info('🔍 Scanning for VMs and LXCs...');
    logger.setProgress(30);

    const response = await fetch(`${API_BASE}/api/sync/preview`);
    const preview = await response.json();

    logger.success(`Found <span class="highlight">${preview.total}</span> VMs/LXCs`);
    logger.info(`└─ <span class="highlight">${preview.vmsWithIP}</span> with IP addresses`);

    if (preview.vmsWithoutIP > 0) {
      logger.warn(`└─ <span class="highlight">${preview.vmsWithoutIP}</span> without IP (will skip)`);
    }
    logger.setProgress(60);

    if (config.sync.checkSSH && preview.sshCheck) {
      logger.info('🔑 Checking SSH port 22 availability...');
      const sshAvailable = preview.sshCheck.filter(h => h.sshAvailable).length;
      const sshUnavailable = preview.sshCheck.filter(h => !h.sshAvailable).length;

      logger.success(`SSH responding on <span class="highlight">${sshAvailable}</span> hosts`);
      if (sshUnavailable > 0) {
        logger.warn(`SSH not available on <span class="highlight">${sshUnavailable}</span> hosts`);
      }
    }
    logger.setProgress(90);

    // Show summary
    const summaryHTML = `
      <div class="stat-card">
        <div class="stat-value">${preview.total}</div>
        <div class="stat-label">Total VMs/LXCs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${preview.vmsWithIP}</div>
        <div class="stat-label">With IP Address</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${preview.vmsWithoutIP}</div>
        <div class="stat-label">Without IP</div>
      </div>
      ${preview.sshCheck ? `
      <div class="stat-card">
        <div class="stat-value">${preview.sshCheck.filter(h => h.sshAvailable).length}</div>
        <div class="stat-label">SSH Available</div>
      </div>
      ` : ''}
    `;

    document.getElementById('previewSummary').innerHTML = summaryHTML;

    // Show table
    let tableHTML = '<table><thead><tr><th>VMID</th><th>Name</th><th>Type</th><th>Node</th><th>IP</th><th>SSH</th><th>Will Sync</th></tr></thead><tbody>';

    for (const vm of preview.vms) {
      const sshStatus = preview.sshCheck
        ? preview.sshCheck.find(h => h.ip === vm.ip)
        : null;

      const sshBadge = sshStatus
        ? (sshStatus.sshAvailable ? '<span class="badge success">Yes</span>' : '<span class="badge error">No</span>')
        : '<span class="badge info">N/A</span>';

      const willSync = vm.ip && (!preview.sshCheck || sshStatus?.sshAvailable);

      tableHTML += `
        <tr>
          <td>${vm.vmid}</td>
          <td>${vm.name}</td>
          <td><span class="badge info">${vm.type}</span></td>
          <td>${vm.node}</td>
          <td>${vm.ip || 'N/A'}</td>
          <td>${sshBadge}</td>
          <td>${willSync ? '<span class="badge success">Yes</span>' : '<span class="badge warning">No</span>'}</td>
        </tr>
      `;
    }

    tableHTML += '</tbody></table>';
    document.getElementById('previewTable').innerHTML = tableHTML;
    document.getElementById('previewData').style.display = 'block';

    logger.setProgress(100);
    logger.complete(true);
    showResult('previewResult', 'Preview loaded successfully', 'success');
  } catch (error) {
    logger.error(`Error: ${error.message}`);
    logger.complete(false);
    showResult('previewResult', `Error: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Load Preview';
  }
});

// Load History (button click - silent load, no toast)
document.getElementById('loadHistoryBtn').addEventListener('click', async () => {
  const btn = document.getElementById('loadHistoryBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Loading...';

  await loadHistorySilently();

  btn.disabled = false;
  btn.textContent = 'Refresh History';
});

// List Proxmox Hosts in Termix
document.getElementById('listProxmoxHostsBtn').addEventListener('click', async () => {
  const btn = document.getElementById('listProxmoxHostsBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Loading...';

  try {
    const response = await fetch(`${API_BASE}/api/cleanup/list`);
    const data = await response.json();

    const summaryHTML = `
      <div class="stat-card">
        <div class="stat-value">${data.total}</div>
        <div class="stat-label">Proxmox Hosts Found</div>
      </div>
    `;

    document.getElementById('cleanupSummary').innerHTML = summaryHTML;

    if (data.total === 0) {
      document.getElementById('cleanupTable').innerHTML = '<p style="color: var(--text-muted);">No Proxmox hosts found in Termix</p>';
      showResult('cleanupResult', 'No Proxmox hosts found in Termix', 'info');
    } else {
      let tableHTML = '<table><thead><tr><th>ID</th><th>Name</th><th>IP</th><th>Port</th><th>Tags</th></tr></thead><tbody>';

      for (const host of data.hosts) {
        const tags = host.tags ? host.tags.join(', ') : '';
        tableHTML += `
          <tr>
            <td>${host.id}</td>
            <td>${host.name}</td>
            <td>${host.ip || 'N/A'}</td>
            <td>${host.port || 22}</td>
            <td><span class="badge info">${tags}</span></td>
          </tr>
        `;
      }

      tableHTML += '</tbody></table>';
      document.getElementById('cleanupTable').innerHTML = tableHTML;
      showResult('cleanupResult', `Found ${data.total} Proxmox hosts`, 'success');
    }

    document.getElementById('cleanupData').style.display = 'block';
  } catch (error) {
    showResult('cleanupResult', `Error: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'List Proxmox Hosts in Termix';
  }
});

// Remove All Proxmox Hosts
document.getElementById('removeAllProxmoxBtn').addEventListener('click', async () => {
  if (!confirm('⚠️ Are you sure you want to remove ALL Proxmox hosts from Termix? This cannot be undone!')) {
    return;
  }

  const btn = document.getElementById('removeAllProxmoxBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Removing...';

  try {
    const response = await fetch(`${API_BASE}/api/cleanup/remove-all`, { method: 'DELETE' });
    const data = await response.json();

    if (data.success) {
      showResult('cleanupResult',
        `Successfully removed ${data.removed} hosts from Termix`,
        'success'
      );

      // Refresh the list
      document.getElementById('cleanupData').style.display = 'none';
    } else {
      showResult('cleanupResult',
        `Removed ${data.removed} hosts, but ${data.failed} failed. ${data.errors.join(', ')}`,
        'error'
      );
    }
  } catch (error) {
    showResult('cleanupResult', `Error: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Remove All Proxmox Hosts';
  }
});

// ============== Scheduler Functions ==============

async function loadSchedulerStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/scheduler/status`);
    const status = await response.json();

    document.getElementById('schedulerActiveStatus').textContent = status.active ? 'Active' : 'Inactive';
    document.getElementById('schedulerActiveStatus').className = status.active ? 'value success' : 'value error';

    document.getElementById('schedulerLastSync').textContent = status.lastSync
      ? new Date(status.lastSync).toLocaleString()
      : 'Never';

    document.getElementById('schedulerNextSync').textContent = status.nextSync
      ? new Date(status.nextSync).toLocaleString()
      : 'N/A';
  } catch (error) {
    console.error('Failed to load scheduler status:', error);
  }
}

// Start Scheduler
document.getElementById('startSchedulerBtn').addEventListener('click', async () => {
  const btn = document.getElementById('startSchedulerBtn');
  const intervalMinutes = parseInt(document.getElementById('syncInterval').value);

  if (!intervalMinutes || intervalMinutes < 1) {
    showResult('schedulerResult', 'Please enter a valid interval (at least 1 minute)', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Starting...';

  try {
    const response = await fetch(`${API_BASE}/api/scheduler/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intervalMinutes })
    });

    const result = await response.json();

    if (result.success) {
      showResult('schedulerResult', `✓ Scheduler started: sync every ${intervalMinutes} minutes`, 'success');
      loadSchedulerStatus();
    } else {
      showResult('schedulerResult', `✗ ${result.error || result.message}`, 'error');
    }
  } catch (error) {
    showResult('schedulerResult', `✗ Error: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Start Scheduler';
  }
});

// Stop Scheduler
document.getElementById('stopSchedulerBtn').addEventListener('click', async () => {
  const btn = document.getElementById('stopSchedulerBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> Stopping...';

  try {
    const response = await fetch(`${API_BASE}/api/scheduler/stop`, {
      method: 'POST'
    });

    const result = await response.json();

    if (result.success) {
      showResult('schedulerResult', '✓ Scheduler stopped', 'success');
      loadSchedulerStatus();
    } else {
      showResult('schedulerResult', `✗ ${result.error || result.message}`, 'error');
    }
  } catch (error) {
    showResult('schedulerResult', `✗ Error: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Stop Scheduler';
  }
});

// Update UI based on SSH auth type selection
function updateAuthTypeUI() {
  const authType = document.getElementById('sshAuthType').value;
  const credentialGroup = document.getElementById('credentialGroup');
  const passwordGroup = document.getElementById('passwordGroup');

  if (authType === 'credential') {
    credentialGroup.style.display = 'block';
    passwordGroup.style.display = 'none';
  } else if (authType === 'password') {
    credentialGroup.style.display = 'block'; // Show password for password auth
    passwordGroup.style.display = 'block';
  } else {
    // 'none' auth type
    credentialGroup.style.display = 'none';
    passwordGroup.style.display = 'none';
  }
}

// SSH Auth Type change handler
document.getElementById('sshAuthType').addEventListener('change', updateAuthTypeUI);

// Initialize
loadSystemStatus();
loadSchedulerStatus();
setInterval(loadSystemStatus, 30000); // Refresh every 30 seconds
setInterval(loadSchedulerStatus, 10000); // Refresh scheduler status every 10 seconds
