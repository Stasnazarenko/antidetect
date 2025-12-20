// Camoufox — ультрастелс macOS Apple Silicon (ARM) 2025
// Мінімальний, але потужний: BrowserForge сам генерує все реалістичне (GPU Apple M*, MacArm, fonts Ventura+)

function _get_fingerprint_config(osType) {
  const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  if (!osType) osType = 'macos';
  if (osType === 'macos') {
    const mac_variants = [
      { cores: 8, inner_w: 1400, inner_h: 800, outer_w: 1400, outer_h: 800 },
    ];
    const variant = mac_variants[Math.floor(Math.random() * mac_variants.length)];

    return {
      'window.outerHeight': variant.outer_h,
      'window.outerWidth': variant.outer_w,
      'window.innerHeight': variant.inner_h,
      'window.innerWidth': variant.inner_w,
      'window.history.length': randomInt(2, 20),
      'navigator.userAgent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Firefox/146.0',
      'navigator.appCodeName': 'Mozilla',
      'navigator.appName': 'Netscape',
      'navigator.appVersion': '5.0 (Macintosh)',
      'navigator.oscpu': 'Intel Mac OS X 10_15_7',
      'navigator.platform': 'MacIntel',
      'navigator.hardwareConcurrency': variant.cores,
      'navigator.product': 'Gecko',
      'navigator.productSub': '20100101',
      'navigator.maxTouchPoints': 0,
      'os': 'macos'
    };
  } else {
    const windows_variants = [
      { cores: 8, inner_w: 1400, inner_h: 800, outer_w: 1400, outer_h: 800 },
      // { cores: 10, outer_w: 1512, outer_h: 982, inner_w: 1512, inner_h: 982 },
      // { cores: 8, outer_w: 1520, outer_h: 980, inner_w: 1504, inner_h: 966 }
    ];
    const variant = windows_variants[Math.floor(Math.random() * windows_variants.length)];

    return {
      'window.outerHeight': variant.outer_h,
      'window.outerWidth': variant.outer_w,
      'window.innerHeight': variant.inner_h,
      'window.innerWidth': variant.inner_w,
      'window.history.length': randomInt(3, 40),
      'navigator.userAgent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:146.0) Gecko/20100101 Firefox/146.0',
      'navigator.appCodeName': 'Mozilla',
      'navigator.appName': 'Netscape',
      'navigator.appVersion': '5.0 (Windows NT 10.0; Win64; x64)',
      'navigator.oscpu': 'Windows NT 10.0; Win64; x64',
      'navigator.platform': 'Win64',
      'navigator.hardwareConcurrency': variant.cores,
      'navigator.product': 'Gecko',
      'navigator.productSub': '20030107',
      'navigator.maxTouchPoints': 10,
      'os': 'windows'
    };
  }
}

// Provide ES module default export so ESM imports work (manage.js uses `import get_Fingerprint from './fingerprint.js'`)
export default _get_fingerprint_config;
