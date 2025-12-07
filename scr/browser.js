const config = require('../config');
const utils = require('../utils');
const db = require('./db');
const fs = require('fs');
const manage = require('./manage');
const fingerprint = require('./fingerprint');
const AsyncLock = require('async-lock');
const lock = new AsyncLock();
const axios = require('axios');
const {SocksProxyAgent} = require('socks-proxy-agent');
const path = require('path');

// Camoufox is loaded dynamically as it's an ES module
let Camoufox;
(async () => {
  const camoufoxModule = await import('camoufox');
  Camoufox = camoufoxModule.Camoufox;
})();


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
  // Ensure Camoufox is loaded
  if (!Camoufox) {
    const camoufoxModule = await import('camoufox');
    Camoufox = camoufoxModule.Camoufox;
  }
  
  let browser;
  await lock.acquire('key', async () => {
    let dir;
    let storageType = await utils.storageType;
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
      persistContext: true,
      persistContextPath: dir,
    };
    
    // Configure fingerprinting if enabled
    if (await profile.get('fingerprint') > false){
      let fpConfig = JSON.parse(fs.readFileSync(dir + '/fp.json'));
      
      // Apply fingerprint configuration to Camoufox
      launchOptions.screen = fpConfig.screen || {
        minWidth: 1440,
        minHeight: 900,
        maxWidth: 1920,
        maxHeight: 1080,
      };
      
      // Enable geolocation based on IP
      launchOptions.geoip = fpConfig.geoip !== false;
      
      // Set hardware concurrency if specified
      if (fpConfig.hardwareConcurrency) {
        launchOptions.hardwareConcurrency = fpConfig.hardwareConcurrency;
      }
      
      // Enable OS spoofing
      if (fpConfig.os && fpConfig.os.length > 0) {
        launchOptions.os = fpConfig.os[Math.floor(Math.random() * fpConfig.os.length)];
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
        console.log(utils.timeLog() + ' Bad proxy at ' + name);
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
      
      // Enable timezone/geolocation based on proxy
      launchOptions.geoip = true;
    }

    // Launch Camoufox
    try {
      browser = await Camoufox.launch(launchOptions);
    } catch (error) {
      console.log(utils.timeLog() + ' Error launching Camoufox: ' + error.message);
      browser = false;
      return false;
    }

    browser.name = name;
    browser.on('disconnected', async () => {
      console.log(utils.timeLog() + `Profile ${name} closed`);
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
        console.log(utils.timeLog() + ' Bad proxy at ' + name);
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

module.exports.launch = launch;





  



