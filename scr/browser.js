import axios from 'axios';

const CAMOUFOX_API = 'http://127.0.0.1:9222';

// Допоміжні функції
function timeLog() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')} >>> `;
}

async function launchProfile(profileName, launchConfig) {
  const response = await axios.post(`${CAMOUFOX_API}/launch`, {
    profile_name: profileName,
    config: launchConfig
  });
  return response.data;
}

async function closeProfile(profileName) {
  const response = await axios.post(`${CAMOUFOX_API}/close`, {
    profile_name: profileName
  });
  return response.data;
}

let launch = async function (name, profile) {
  if (!profile) {
    console.log(timeLog() + 'Error: Profile not found');
    return false;
  }

  try {
    // Будуємо конфіг для Camoufox
    const launchConfig = {
      headless: profile.headless || false,
      timeout: profile.timeout || 120000
    };

    // Fingerprint
    if (profile.fingerprint) {
      launchConfig.fingerprint = profile.fingerprint;
    }

    // Proxy
    if (profile.proxy) {
      launchConfig.proxy = profile.proxy;
    }

    console.log(timeLog() + `Launching Camoufox for profile ${name}...`);
    const result = await launchProfile(name, launchConfig);

    if (!result.success) {
      console.log(timeLog() + ' Error: ' + result.error);
      return false;
    }

    console.log(timeLog() + `Camoufox launched for profile ${name}`);

    return {
      name,
      isRemote: true,
      close: async () => {
        console.log(timeLog() + `Closing profile ${name}...`);
        await closeProfile(name);
      }
    };

  } catch (err) {
    console.log(timeLog() + ' Error: ' + (err?.message ?? err));
    return false;
  }
};

export { launch };
