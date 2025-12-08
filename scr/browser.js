import * as config from '../config.js';
import { timeLog, state } from '../utils.js';
import * as db from './db.js';
import fs from 'fs';
import * as manage from './manage.js';
import fingerprint from './fingerprint.js';
import AsyncLock from 'async-lock';
import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import path from 'path';

const lock = new AsyncLock();

// Camoufox will be loaded dynamically when needed (it's an ES module)
let Camoufox = null;


let proxyChecker = async function (type, proxy, auth){
  let host = proxy.split(':')[0];
  let port = proxy.split(':')[1]
  let username = auth.split(':')[0];
  let password = auth.split(':')[1];
  let check;
  if (type == 'https'){
    try {
      check = await axios.get('http://ip.bablosoft.com/', {
      proxy: {
        protocol: 'http',
        host: host,
        port: port,
        auth: {
          username,
          password,
        },
      },
    });
    } catch (err){
      check = false;
    }
   };
  if (type == 'socks5'){
    const proxyAgent  = new SocksProxyAgent(`socks5://${username}:${password}@${host}:${port}`);
    const axiosInstance = axios.create({
      httpsAgent: proxyAgent, 
      httpAgent: proxyAgent 
    });
    try {
      check = await axiosInstance.get('http://ip.bablosoft.com/');
    check = check.status;
    } catch (err){
      check = false;
    }
  };
  if (check)
    return true;
  else 
    return false;
};

let launch = async function (name, profile){
  // Load Camoufox dynamically when first needed
  if (!Camoufox) {
    try {
      const camoufoxModule = await import('camoufox');
      Camoufox = camoufoxModule.Camoufox;
    } catch (error) {
      console.log(timeLog() + ' Error loading Camoufox: ' + error.message);
      console.log(timeLog() + ' Make sure Camoufox is installed: npm install camoufox');
      return false;
    }
  }
  
  let browser;
  await lock.acquire('key', async () => {
    let dir;
    let storageType = await state.storageType;
    switch(storageType){
      case 'Cloud':
        dir = config.cloudDir + `profiles/${name}`;
        break;
      case 'Local':
        dir = config.storageDir + `profiles/${name}`;
        break;
    };
    if (!fs.existsSync(dir))
      fs.mkdirSync(dir, { recursive: true });

    if (!fs.existsSync(dir + '/fp.json')){
      let fp = await fingerprint();
      let data = JSON.parse(fp);
      fs.writeFileSync(dir +'/fp.json', JSON.stringify(data));
    };

    // Camoufox launch options
    let launchOptions = {
      headless: false,
      data_dir: dir, // Use data_dir for persistent context
      geoip: true, // Enable GeoIP for location-based configuration
      humanize: true, // Enable human-like cursor movement
      block_webrtc: true, // Block WebRTC to prevent IP leaks
    };
    
    // Configure fingerprinting if enabled
    if (await profile.get('fingerprint') > false){
      let fpConfig = JSON.parse(fs.readFileSync(dir + '/fp.json'));
      
      // Apply fingerprint configuration to Camoufox
      if (fpConfig.screen) {
        launchOptions.screen = {
          min_width: fpConfig.screen.minWidth || 1440,
          min_height: fpConfig.screen.minHeight || 900,
          max_width: fpConfig.screen.maxWidth || 1920,
          max_height: fpConfig.screen.maxHeight || 1080,
        };
      }
      
      // Enable OS spoofing - select random OS from the list
      if (fpConfig.os && fpConfig.os.length > 0) {
        const randomOS = fpConfig.os[Math.floor(Math.random() * fpConfig.os.length)];
        launchOptions.os = randomOS;
      }
    }

    // Configure proxy if set
    let proxyType = await profile.get('proxyType');
    if (!proxyType == false){
      let proxy = await profile.get('proxy');
      let login = proxy.split(':', -2);
      proxy = proxy.split(':', 2);
      login = login[2] + ':' + login[3];
      let check = await proxyChecker(proxyType, proxy.join(":"), login);
      if (check == false){
        console.log(timeLog() + ' Bad proxy at ' + name);
        browser =  false;
        return false;
      }

      // Set proxy for Camoufox
      let [username, password] = login.split(':');
      launchOptions.proxy = {
        server: `${proxyType}://${proxy.join(":")}`,
      };
      
      if (username && password) {
        launchOptions.proxy.username = username;
        launchOptions.proxy.password = password;
      }
    }

    // Launch Camoufox
    try {
      browser = await Camoufox(launchOptions);
    } catch (error) {
      console.log(timeLog() + ' Error launching Camoufox: ' + error.message);
      browser = false;
      return false;
    }

    browser.name = name;
    browser.on('disconnected', async () => {
      console.log(timeLog() + `Profile ${name} closed`);
      delete manage.active[name];
      switch(storageType){
        case 'Cloud':
          setTimeout(db.close_Profile, 5000, name);
          break;
        case 'Local':
          setTimeout(db.close_Profile, 3000, name);
          break;
      };
    });  
  });
  
  if (browser == false)
    return false;
  
  let page = await browser.newPage();
  try{
    if (name.includes('Grass')){
      try {
        await page.goto('https://app.getgrass.io/dashboard');
      }
      catch (err){
        console.log(timeLog() + ' Bad proxy at ' + name);
        await browser.close();
        page = false;
      }
    }
    else
      await page.goto('https://abrahamjuliot.github.io/creepjs/');
  }
  catch(err){
    await page.goto('https://google.com/');
  }
  
  let pages = await browser.pages();
  for (let i = 0; i < pages.length; i++){
    let url = pages[i].url();
    if (url == 'about:blank')
      await pages[i].close();
  };
  return page;
};

export { launch };





  



