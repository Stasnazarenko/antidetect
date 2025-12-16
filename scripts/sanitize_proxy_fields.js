import fs from 'fs/promises';
import path from 'path';

async function sanitize(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    let changed = 0;
    if (Array.isArray(data.profiles)) {
      for (const p of data.profiles) {
        if (p.proxy && typeof p.proxy === 'object') {
          // fix mismatch: server starts with quote and password ends with quote
          if (typeof p.proxy.server === 'string' && typeof p.proxy.password === 'string') {
            if (p.proxy.server.startsWith('"') && p.proxy.password.endsWith('"')) {
              p.proxy.server = p.proxy.server.replace(/^"+/, '');
              p.proxy.password = p.proxy.password.replace(/"+$/, '');
              changed++;
            }
            if (p.proxy.server.startsWith('\"') && p.proxy.password.endsWith('\"')) {
              p.proxy.server = p.proxy.server.replace(/^\\"+/, '');
              p.proxy.password = p.proxy.password.replace(/\\"+$/, '');
              changed++;
            }
          }
          // general strip surrounding quotes
          ['server','username','password'].forEach(k => {
            if (p.proxy[k] && typeof p.proxy[k] === 'string') {
              const s = p.proxy[k].trim();
              if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
                p.proxy[k] = s.substring(1, s.length-1);
                changed++;
              }
            }
          });
        }
      }
    }
    // If file appears to be proxies list
    if (Array.isArray(data)) {
      for (const p of data) {
        if (p.host && typeof p.host === 'string') {
          const s = p.host.trim();
          if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
            p.host = s.substring(1, s.length-1); changed++;
          }
        }
        if (p.port && typeof p.port === 'string') {
          const s = p.port.trim();
          if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
            p.port = s.substring(1, s.length-1); changed++;
          }
        }
      }
    }

    if (changed > 0) {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    }
    return { changed };
  } catch (e) {
    return { error: e.message };
  }
}

(async () => {
  const profilesFile = path.join(process.cwd(), 'storage', 'profiles.json');
  const proxiesFile = path.join(process.cwd(), 'storage', 'proxies.json');
  console.log('Sanitizing', profilesFile);
  const r1 = await sanitize(profilesFile);
  console.log('profiles.json result:', r1);
  try {
    await fs.access(proxiesFile);
    console.log('Sanitizing', proxiesFile);
    const r2 = await sanitize(proxiesFile);
    console.log('proxies.json result:', r2);
  } catch (e) {
    console.log('proxies.json not found, skipping');
  }
})();

