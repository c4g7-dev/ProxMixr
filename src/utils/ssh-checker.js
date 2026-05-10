const net = require('net');

/**
 * Check if SSH port 22 is available on a given host
 * @param {string} host - IP address or hostname
 * @param {number} timeout - Timeout in milliseconds (default: 3000)
 * @returns {Promise<boolean>} - True if port 22 is open, false otherwise
 */
async function checkSSHPort(host, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;

    const cleanup = () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      cleanup();
      resolve(true);
    });

    socket.on('timeout', () => {
      cleanup();
      resolve(false);
    });

    socket.on('error', () => {
      cleanup();
      resolve(false);
    });

    try {
      socket.connect(22, host);
    } catch (error) {
      cleanup();
      resolve(false);
    }
  });
}

/**
 * Check SSH availability for multiple hosts in parallel
 * @param {Array<{ip: string, name: string}>} hosts - Array of host objects
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Array<{ip: string, name: string, sshAvailable: boolean}>>}
 */
async function checkMultipleHosts(hosts, timeout = 3000) {
  const checks = hosts.map(async (host) => {
    const sshAvailable = await checkSSHPort(host.ip, timeout);
    return {
      ...host,
      sshAvailable
    };
  });

  return Promise.all(checks);
}

module.exports = {
  checkSSHPort,
  checkMultipleHosts
};
