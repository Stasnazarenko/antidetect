import fs from 'fs/promises';
import path from 'path';

(async () => {
  try {
    const file = path.join(process.cwd(), 'storage', 'profiles.json');
    console.log('Resetting open flags in', file);
    const raw = await fs.readFile(file, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.profiles)) {
      console.error('profiles.json malformed: no profiles array');
      process.exit(1);
    }
    let changed = 0;
    for (const p of data.profiles) {
      if (p.open) { p.open = false; changed++; }
    }
    if (changed > 0) {
      await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
      console.log('Done. Profiles updated:', changed);
    } else {
      console.log('No profiles needed resetting');
    }
    process.exit(0);
  } catch (e) {
    console.error('Reset script error', e);
    process.exit(2);
  }
})();

