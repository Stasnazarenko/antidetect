import fs from 'fs/promises';
import path from 'path';
const file = path.join(process.cwd(), 'storage', 'profiles.json');
console.log('Sanitizer starting on', file);
(async () => {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.profiles)) {
      console.error('No profiles array found'); process.exit(3);
    }

    function stripQuotes(s) {
      if (typeof s !== 'string') return s;
      const t = s.trim();
      if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.substring(1, t.length-1);
      return t;
    }

    let changed = 0;
    for (const p of data.profiles) {
      if (p.name && typeof p.name === 'string') {
        const clean = stripQuotes(p.name);
        if (clean !== p.name) { p.name = clean; changed++; }
      }
      if (p.proxy && typeof p.proxy === 'object') {
        if (p.proxy.server && typeof p.proxy.server === 'string') {
          const clean = stripQuotes(p.proxy.server);
          const s = clean.replace(/^(https?:\/\/|socks5?:\/\/)*/i, '');
          if (s !== p.proxy.server) { p.proxy.server = s; changed++; }
          else if (clean !== p.proxy.server) { p.proxy.server = clean; changed++; }
        }
        if (p.proxy.username && typeof p.proxy.username === 'string') {
          const clean = stripQuotes(p.proxy.username);
          if (clean !== p.proxy.username) { p.proxy.username = clean; changed++; }
        }
        if (p.proxy.password && typeof p.proxy.password === 'string') {
          const clean = stripQuotes(p.proxy.password);
          if (clean !== p.proxy.password) { p.proxy.password = clean; changed++; }
        }
      }
    }

    if (changed > 0) {
      await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
      console.log('Sanitization complete, changes made:', changed);
    } else {
      console.log('No changes necessary');
    }
    process.exit(0);
  } catch (e) {
    console.error('Sanitizer error', e);
    process.exit(2);
  }
})();
