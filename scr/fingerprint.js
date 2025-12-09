// Camoufox — ультрастелс macOS Apple Silicon (ARM) 2025
// Мінімальний, але потужний: BrowserForge сам генерує все реалістичне (GPU Apple M*, MacArm, fonts Ventura+)

let get_Fingerprint = async function(){
  const fingerprint = {
    // Фіксуємо macOS — BrowserForge автоматично поставить ARM (MacArm) + Apple GPU (M1–M4 варіанти)
    os: 'macos',

    // Актуальні версії: Sonoma/Sequoia — це гарантує ARM + сучасні fonts/GPU
    osVersion: {
      min: '14.0',  // Sonoma
      max: '15.2',  // Sequoia
      preferred: ['14.5', '14.6', '15.0', '15.1']  // Найпоширеніші в 2025
    },

    // Реальні Retina роздільні здатності для MacBook Pro/Air M-чіпів
    screen: {
      minWidth: 1440,
      minHeight: 900,
      maxWidth: 3456,
      maxHeight: 2234,
      preferred: [
        [2560, 1600], [2560, 1664],  // MacBook Pro 14" scaled
        [3024, 1964],               // MacBook Pro 16" native
        [3456, 2234],               // MacBook Pro 16" high-res
        [1728, 1117], [1512, 982]   // MacBook Air/Pro scaled варіанти
      ]
    },

    // Hardware: типово для M-чіпів
    hardwareConcurrency: { min: 8, max: 10 },
    deviceMemory: { min: 16, max: 64, preferred: [16, 32] },

    // Критично: гео по IP — усуває VPN/proxy detection + mismatch timezone
    geoip: true,

    // Людські рухи миші/клаві
    humanize: true,

    // Імітація реального дисплею (не headless)
    headless: "virtual",

    // Без блокувань (блокування палиться як privacy extensions)
    block_images: false,
    block_media: false,
  };

  return JSON.stringify(fingerprint);
};

export default get_Fingerprint;