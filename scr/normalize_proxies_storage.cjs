const fs = require('fs');
const path = require('path');

const proxiesPath = path.resolve(__dirname, '..', 'storage', 'proxies.json');
const backupPath = proxiesPath + '.bak.' + Date.now();

function normalizeOne(proxy) {
  if (!proxy) return null;
  // If it's already well-formed (has host and port or server) keep but normalize
  let p = Object.assign({}, proxy);

  // If proxy has server field like host:port, split
  if (p.server && typeof p.server === 'string') {
    const s = p.server.replace(/^(https?:\/\/|socks5?:\/\/|socks4?:\/\/)*/i, '');
    const parts = s.split(':');
    p.host = parts[0] || p.host;
    p.port = parts[1] || p.port;
    delete p.server;
  }

  // If proxy has host field but host contains scheme or extra parts (common broken entries)
  if (p.host && typeof p.host === 'string' && /^(https?:\/\/|socks5?:\/\/)/i.test(p.host)) {
    let s = p.host.replace(/^(https?:\/\/|socks5?:\/\/|socks4?:\/\/)*/i, '');
    // sometimes host became 'http' and port contains '//host'
    if (s.includes('//')) s = s.replace(/\//g, '');
    const parts = s.split(':');
    if (parts.length >= 2) {
      p.host = parts[0];
      p.port = parts[1] || p.port;
    }
  }

  // If host looks like 'http' and port like '//89.33...' attempt to repair from other fields
  if (p.host === 'http' && p.port && p.port.startsWith('//')) {
    const trimmed = p.port.replace(/^\/\//, '');
    const parts = trimmed.split(':');
    p.host = parts[0];
    p.port = parts[1] || p.port;
  }

  // If still missing host or port but there's an id and createdAt and maybe combined properties, try to parse any string fields
  if ((!p.host || !p.port) && typeof proxy === 'object') {
    // try to reconstruct from JSON-stringified original
    for (const key of Object.keys(proxy)) {
      const val = String(proxy[key] || '');
      if (val.includes(':') && val.match(/\d+/)) {
        const parts = val.replace(/^(https?:\/\/|socks5?:\/\/|socks4?:\/\/)*/i, '').split(':');
        if (parts.length >= 2) {
          p.host = p.host || parts[0];
          p.port = p.port || parts[1];
        }
      }
    }
  }

  // Ensure port is string
  if (p.port !== undefined) p.port = String(p.port);

  // Default fields
  if (!p.type) p.type = 'http';
  if (!Array.isArray(p.tags)) p.tags = p.tags ? [p.tags] : [];
  if (!p.id) p.id = Date.now().toString() + '_' + Math.random().toString(36).slice(2,8);
  if (!p.status) p.status = 'inactive';
  if (typeof p.testResult === 'undefined') p.testResult = null;
  if (!p.createdAt) p.createdAt = new Date().toISOString();

  // Validate host/port presence
  if (!p.host || !p.port) return null;

  return p;
}

function run() {
  if (!fs.existsSync(proxiesPath)) {
    console.error('proxies.json not found at', proxiesPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(proxiesPath, 'utf8');
  fs.writeFileSync(backupPath, raw, 'utf8');
  console.log('Backup saved to', backupPath);

  let list;
  try {
    list = JSON.parse(raw);
    if (!Array.isArray(list)) throw new Error('proxies.json should be array');
  } catch (e) {
    console.error('Failed to parse proxies.json:', e.message);
    process.exit(1);
  }

  let cleaned = [];
  let removed = 0;
  for (const p of list) {
    const norm = normalizeOne(p);
    if (norm) cleaned.push(norm); else removed++;
  }

  fs.writeFileSync(proxiesPath, JSON.stringify(cleaned, null, 2), 'utf8');
  console.log(`Normalized proxies: kept ${cleaned.length}, removed ${removed}. Updated ${proxiesPath}`);
}

run();

