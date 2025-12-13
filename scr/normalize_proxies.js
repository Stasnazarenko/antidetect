const fs = require('fs');
const path = require('path');

const storagePath = path.resolve(__dirname, '..', 'storage', 'profiles.json');
const backupPath = storagePath + '.bak.' + Date.now();

function normalizeProxy(proxy) {
  if (!proxy) return false;
  if (typeof proxy === 'object') {
    // ensure server has no scheme
    const obj = Object.assign({}, proxy);
    if (obj.server && typeof obj.server === 'string') {
      obj.server = obj.server.replace(/^(https?:\/\/|socks5?:\/\/|socks4?:\/\/)*/i, '');
    }
    return obj;
  }
  let s = String(proxy).trim();
  // strip repeated schemes
  s = s.replace(/^(https?:\/\/|socks5?:\/\/|socks4?:\/\/)*/i, '');

  // try JSON
  try {
    const p = JSON.parse(s);
    if (p && (p.server || p.host)) {
      if (p.server && typeof p.server === 'string') p.server = p.server.replace(/^(https?:\/\/|socks5?:\/\/|socks4?:\/\/)*/i, '');
      return p;
    }
  } catch (e) {}

  // user:pass@host:port
  if (s.includes('@')) {
    const parts = s.split('@');
    const auth = parts[0];
    const hostPart = parts[1];
    const [user, pass] = auth.split(':');
    const hostClean = hostPart.replace(/^(https?:\/\/|socks5?:\/\/|socks4?:\/\/)*/i, '');
    const hostParts = hostClean.split(':');
    const server = hostParts.length > 1 ? `${hostParts[0]}:${hostParts[1]}` : hostParts[0];
    const obj = { server, type: 'http' };
    if (user) obj.username = user;
    if (pass) obj.password = pass;
    return obj;
  }

  const parts = s.split(':');
  if (parts.length >= 4) {
    const host = parts[0];
    const port = parts[1];
    const username = parts[2] || '';
    const password = parts[3] || '';
    const type = parts[4] || 'http';
    const server = `${host}:${port}`;
    const obj = { server, type };
    if (username) obj.username = username;
    if (password) obj.password = password;
    return obj;
  }
  if (parts.length === 3) {
    const [host, port, username] = parts;
    const server = `${host}:${port}`;
    const obj = { server, type: 'http' };
    if (username) obj.username = username;
    return obj;
  }
  if (parts.length === 2) {
    const [host, port] = parts;
    return { server: `${host}:${port}`, type: 'http' };
  }

  // fallback
  return { server: s, type: 'http' };
}

function run() {
  if (!fs.existsSync(storagePath)) {
    console.error('profiles.json not found at', storagePath);
    process.exit(1);
  }
  const raw = fs.readFileSync(storagePath, 'utf8');
  const data = JSON.parse(raw);
  fs.writeFileSync(backupPath, raw, 'utf8');
  console.log('Backup saved to', backupPath);

  let changed = 0;
  if (Array.isArray(data.profiles)) {
    data.profiles = data.profiles.map(p => {
      if (!p) return p;
      const proxy = p.proxy;
      if (!proxy) return p;
      const normalized = normalizeProxy(proxy);
      if (normalized) {
        p.proxy = normalized;
        p.proxyType = normalized.type || p.proxyType || 'http';
        changed++;
      } else {
        p.proxy = false;
        p.proxyType = 'http';
        changed++;
      }
      return p;
    });
  }

  fs.writeFileSync(storagePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Normalized proxies for ${changed} profiles. Updated ${storagePath}`);
}

run();

