// Camoufox has built-in fingerprinting, so we generate a default config
// This function returns a configuration object for Camoufox fingerprinting

let get_Fingerprint = async function(){
  // Camoufox generates fingerprints automatically
  // We can customize various aspects of the fingerprint
  const fingerprint = {
    // Screen configuration
    screen: {
      minWidth: 1440,
      minHeight: 900,
      maxWidth: 1920,
      maxHeight: 1080,
    },
    // OS preferences
    os: ['windows', 'macos', 'linux'],
    // Browser preferences
    geoip: true, // Use geolocation based on IP
    // Hardware preferences
    hardwareConcurrency: { min: 2, max: 16 },
  };
  return JSON.stringify(fingerprint);
};

export default get_Fingerprint;
