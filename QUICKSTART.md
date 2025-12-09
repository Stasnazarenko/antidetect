# Quick Start - Local Mode (No Google Sheets)

Get started with antidetect browser in under 5 minutes without any Google setup!

## Prerequisites

- Node.js 16 or higher
- Any OS: Windows, Linux, macOS (including M1/M2), or ARM

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Stasnazarenko/antidetect.git
   cd antidetect
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create basic configuration**
   ```bash
   cp .env_example .env
   ```
   
   The default `.env` with empty values will enable local mode automatically!

4. **Run the application**
   ```bash
   node index
   ```

## Your First Profile

Once the application starts, you'll see:

```
Using local database mode (Google Sheets not configured)
Running in LOCAL MODE (no Google Sheets integration)
```

1. Select **"Profiles"** from the menu
2. Select **"New profile"**
3. Enter a name for your profile (e.g., "test1")
4. Select **"Open"** to launch the browser

The browser will open with:
- ✅ Automatic fingerprinting
- ✅ WebRTC protection
- ✅ Human-like behavior
- ✅ Opens CreepJS test page by default

## What's Stored Locally?

All your data is stored in:
- `storage/profiles.json` - Profile metadata
- `storage/profiles/<name>/` - Browser data (cookies, cache, etc.)

## Managing Profiles

### Create a Profile
1. Profiles → New profile
2. Enter name
3. Profile is created with automatic fingerprinting

### Open a Profile
1. Profiles → List of profiles
2. Select profile
3. Click "Open"

### Add Proxy to Profile
1. Profiles → List of profiles
2. Select profile
3. Select "Proxy" → "Set new proxy"
4. Choose protocol (HTTP/HTTPS or SOCKS5)
5. Enter: `ip:port:username:password`

### Change Fingerprint
1. Profiles → List of profiles
2. Select profile
3. Select "Fingerprint" → "Change fingerprint"
4. New fingerprint generated automatically

### Delete a Profile
1. Profiles → List of profiles
2. Select profile
3. Select "Delete"

## Testing Anti-Detection

Each profile opens CreepJS by default, which shows:
- Browser fingerprint quality
- Detection risk score
- Detailed fingerprint analysis

Visit these sites to test:
- https://abrahamjuliot.github.io/creepjs/
- https://browserscan.net/
- https://fingerprint.com/products/bot-detection/

## Local Mode Features

✅ **What Works:**
- Create unlimited profiles
- All fingerprinting features
- Proxy support
- Profile management
- Multi-processing
- 100% offline after initial setup

❌ **What's Disabled:**
- Dashboard (Google Sheets sync)
- Cloud storage
- Team collaboration

## Upgrading to Google Sheets

Want to enable cloud sync later?

1. Follow Steps 1-3 in the main README.md
2. Update your `.env` file with Google credentials
3. Restart the application
4. You'll now see "Dashboard" in the menu

## Tips

- Profiles are stored in `storage/` - back this up!
- Use descriptive profile names (e.g., "amazon-profile1")
- Test proxies before using them
- Regenerate fingerprints periodically for better anonymity

## Common Issues

**"Error loading Camoufox"**
```bash
npx camoufox fetch
```

**Browser takes long to start first time**
- Normal! Camoufox downloads Firefox binary (~100MB)
- Subsequent starts are much faster

**"Profile already exists"**
- Delete the profile first, or use a different name
- Or delete the `storage/` folder to start fresh

## Need More Features?

This local mode is great for personal use. For advanced features:
- **Cloud Sync**: Set up Google Sheets (see main README)
- **Team Collaboration**: Use Google Sheets Dashboard
- **Multi-Device**: Use Cloud storage mode

## Performance

- Each profile: ~200-400MB RAM
- Startup time: 5-10 seconds (after first launch)
- Disk space: ~500MB per profile

## Privacy

In local mode:
- ✅ No data sent to external services
- ✅ No API calls for fingerprinting
- ✅ No cloud storage
- ✅ All data stays on your computer
- ✅ GeoIP only used if you enable proxy

## Next Steps

1. Create a few test profiles
2. Test different fingerprint configurations
3. Add proxies to profiles
4. Test on fingerprinting websites
5. Use for your multi-account needs!

## Support

- Run `node test.js` to verify your setup
- Check MIGRATION.md for detailed info
- See README.md for full documentation

---

**Happy browsing! 🎭**
