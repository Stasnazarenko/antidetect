# Migration Guide: Camoufox Integration

## What Changed?

This update migrates the antidetect browser from `playwright-with-fingerprints` to **Camoufox**, bringing significant improvements:

### Key Improvements

1. **macOS and ARM Support** 🎉
   - Now works natively on macOS (including Apple Silicon M1/M2)
   - Full ARM architecture support
   - No more platform compatibility issues

2. **No API Keys Required** 🔑
   - Removed dependency on FingerprintSwitcher service
   - No need for `FPKEY` in your `.env` file
   - Fingerprints generated locally using BrowserForge

3. **Fully Local Mode** 💾
   - Can now run without Google Sheets integration
   - Perfect for privacy-focused users
   - Simpler setup process

4. **Better Anti-Detection** 🛡️
   - Advanced fingerprinting via Camoufox
   - GeoIP-based automatic configuration
   - Human-like cursor movement
   - Built-in WebRTC blocking

## Migration Steps

### For Existing Users

1. **Update Dependencies**
   ```bash
   npm install
   ```

2. **Update Your `.env` File**
   - Remove the `FPKEY` line (no longer needed)
   - Your `.env` should look like:
   ```plaintext
   DIR = ""
   GOOGLEEMAIL = ""
   GOOGLESHEETID = ""
   GOOGLEKEY = ""
   NODE_ENV = "test"
   ```

3. **Optional: Download Camoufox Browser**
   ```bash
   npx camoufox fetch
   ```
   If this fails (e.g., in restricted networks), Camoufox will auto-download on first use.

4. **Run the Application**
   ```bash
   node index
   ```

### For New Users (Local Mode)

Want to try it without any Google setup? Just:

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Create a Simple `.env` File**
   ```plaintext
   DIR = ""
   GOOGLEEMAIL = ""
   GOOGLESHEETID = ""
   GOOGLEKEY = ""
   NODE_ENV = "test"
   ```

3. **Run It!**
   ```bash
   node index
   ```

The application will automatically detect that Google Sheets is not configured and run in local mode!

## What's Different?

### Browser Engine
- **Before**: Chromium-based (via Playwright with fingerprints)
- **After**: Firefox-based (via Camoufox)

### Fingerprinting
- **Before**: External API call to FingerprintSwitcher service
- **After**: Local generation using BrowserForge

### Database
- **Before**: Google Sheets only
- **After**: Google Sheets OR local JSON file (auto-detected)

### Platforms
- **Before**: Windows and Linux only
- **After**: Windows, Linux, macOS (including Apple Silicon), and ARM

## Testing Your Setup

Run the included test suite:
```bash
node test.js
```

This will verify:
- ✓ All dependencies installed
- ✓ Camoufox module ready
- ✓ Local mode working
- ✓ Database operations functional
- ✓ Configuration correct

## Troubleshooting

### "Error loading Camoufox"
- Run: `npm install camoufox`
- Or: `npx camoufox fetch`

### "Using local database mode" (when you want Google Sheets)
- Check your `.env` file has valid values for:
  - `GOOGLEEMAIL`
  - `GOOGLEKEY`
  - `GOOGLESHEETID`

### Browser doesn't launch
- First launch may take longer as Camoufox downloads
- Check your internet connection
- Try: `npx camoufox fetch` manually

## Performance Notes

### Startup Time
- First launch: ~30-60 seconds (downloads browser binaries)
- Subsequent launches: ~5-10 seconds

### Resource Usage
- Camoufox is Firefox-based, generally lighter than Chromium
- Each profile uses ~200-400MB RAM

## Security & Privacy

### What Data is Sent?
- **Local Mode**: Nothing! All data stays on your computer
- **Google Sheets Mode**: Only profile metadata to your own Google Sheet
- **Fingerprinting**: Generated locally, no external calls
- **GeoIP**: Optional, only when using proxy with geoip enabled

### What's Stored Locally?
- Profile data (in `storage/` directory or Google Drive)
- Browser profiles (cookies, cache, etc.)
- Camoufox binary (in node_modules)

## Need Help?

1. Check the updated README.md for detailed documentation
2. Run `node test.js` to diagnose issues
3. Check GitHub issues for known problems
4. The application logs helpful messages to console

## Rollback (if needed)

If you need to go back to the old version:
```bash
git checkout <previous-commit>
npm install
```

## Credits

- **Camoufox**: https://github.com/daijro/camoufox
- **BrowserForge**: https://github.com/daijro/browserforge
- Original antidetect browser contributors

---

**Version**: 2.0  
**Date**: December 2025  
**Compatibility**: Node.js 16+, Windows/Linux/macOS/ARM
