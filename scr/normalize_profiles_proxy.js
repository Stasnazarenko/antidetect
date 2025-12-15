const fs = require('fs');
const path = require('path');

const profilesPath = path.resolve(__dirname, '..', 'storage', 'profiles.json');
const backup = profilesPath + '.bak.' + Date.now();

function normalizeProfile(p) {
  if (!p) return p;
  const copy = Object.assign({}, p);

  // If proxy is an object but server looks like '[object Object]' or contains 'object Object'
  if (copy.proxy && typeof copy.proxy === 'object') {
    if (copy.proxy.server && String(copy.proxy.server).includes('[object Object]')) {
      // try to replace from proxyInfo if available
      if (copy.proxyInfo && copy.proxyInfo.host && copy.proxyInfo.port) {
        copy.proxy = {
          server: `${copy.proxyInfo.host}:${copy.proxyInfo.port}`,
          type: copy.proxy.type || 'http',
          username: copy.proxy.username || copy.proxy.user || copy.proxy.username || undefined,
          password: copy.proxy.password || copy.proxy.pass || undefined
        };
      } else {
        // try to reconstruct from fields inside proxy (host/port)
        if (copy.proxy.host && copy.proxy.port) {
          copy.proxy.server = `${copy.proxy.host}:${copy.proxy.port}`;
        } else {
          // fallback: remove invalid server and set proxy to false
          copy.proxy = false;
          copy.proxyType = 'http';
        }
      }
    }
  }

  // If proxy is string containing '[object Object]' replace
  if (copy.proxy && typeof copy.proxy === 'string' && copy.proxy.includes('[object Object]')) {
    if (copy.proxyInfo && copy.proxyInfo.host && copy.proxyInfo.port) {
      copy.proxy = { server: `${copy.proxyInfo.host}:${copy.proxyInfo.port}`, type: 'http' };
    } else {
      copy.proxy = false;
      copy.proxyType = 'http';
    }
  }

  // Ensure proxyType exists
  if (!copy.proxyType) copy.proxyType = 'http';

  return copy;
}

function run() {
  if (!fs.existsSync(profilesPath)) {
    console.error('profiles.json not found at', profilesPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(profilesPath, 'utf8');
  fs.writeFileSync(backup, raw, 'utf8');
  console.log('Backup saved to', backup);

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse profiles.json', e.message);
    process.exit(1);
  }

  if (!data.profiles || !Array.isArray(data.profiles)) {
    console.error('profiles.json has unexpected structure (no "profiles" array)');
    process.exit(1);
  }

  let changed = 0;
  const newProfiles = data.profiles.map(p => {
    const np = normalizeProfile(p);
    if (JSON.stringify(np) !== JSON.stringify(p)) changed++;
    return np;
  });

  const out = { ...data, profiles: newProfiles };
  fs.writeFileSync(profilesPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Normalized profiles.json, changed ${changed} profiles`);
}

run();

