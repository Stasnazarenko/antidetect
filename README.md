# Antidetect browser
<p>
      <img src="https://i.ibb.co/3sHQCSp/av.jpg" >
</p>

<p >
   <img src="https://img.shields.io/badge/build-v_2.0-brightgreen?label=Version" alt="Version">
   <img src="https://img.shields.io/badge/macOS-supported-blue" alt="macOS Support">
   <img src="https://img.shields.io/badge/ARM-supported-blue" alt="ARM Support">
</p>





## About

A console application with a simple user interface for managing and working with browser profiles with anti-detection protection. 

**Now powered by [Camoufox](https://github.com/daijro/camoufox)** - an advanced anti-fingerprinting tool for Firefox automation with native support for **macOS** and **ARM** architectures!

The application uses Camoufox's sophisticated browser fingerprint spoofing capabilities to create virtual identities and increase the secrecy of your browser. Camoufox provides advanced anti-detection features including:

- **Advanced Fingerprint Spoofing**: Built-in fingerprint generation without relying on external services
- **GeoIP Integration**: Automatic timezone, language, and location configuration based on your IP/proxy
- **Human-like Behavior**: Cursor movement humanization for more natural browsing
- **WebRTC Protection**: Built-in WebRTC blocking to prevent IP leaks
- **Cross-Platform Support**: Native support for Windows, macOS (including M1/M2), and Linux

The application will allow you to increase your anonymity on the web. You can use multi-accounts on any platforms as different users. Thanks to the simple console interface, you don't need any skills to use antidetect. This project is for the community and I will gradually develop and improve it in the future. 

## Usage

The aim of my project, the "Antidetect browser," is to empower users with the ability to create and manage multiple virtual browser profiles, ensuring their anonymity and privacy online. Through the "Antidetect browser," users gain the following capabilities:

- **Creating Custom Browser Profiles**: Users can craft browser profiles tailored to their specific needs, with unique configurations and settings.
- **Proxy Integration**: Each profile supports the integration of proxy servers, enabling anonymous connections to the Internet.

- **Fingerprint Masking**: Advanced fingerprint masking powered by Camoufox and BrowserForge, including User-Agent, Canvas Fingerprint, WebGL, and more.

- **Enhanced Privacy Features**: Automatic WebRTC blocking, timezone/geolocation based on proxy, and other privacy-preserving features.

- **Secure Data Management**: The project provides users with the means to manage their own data storage for each profile, ensuring data isolation and privacy between profiles.

- **macOS & ARM Support**: Now fully compatible with macOS (including Apple Silicon M1/M2) and ARM architectures.

With the "Antidetect browser," I aim to offer users a comprehensive toolset to navigate the online world with confidence, knowing that their privacy and anonymity are prioritized.

## Review

### Profiles
Profiles is a individual browser instances, similar to profiles in the Google Chrome browser. Each profile has its own storage, settings, and data, which can be stored either in the cloud for accessibility and synchronization across devices or locally on your system for increased confidentiality and security.
<p align="center">
      <img src="https://i.ibb.co/SNbBrNz/1.gif" >
</p>
The application provides a convenient and simple interface accessible through a console application. Users can easily create and manage profiles, including setting up proxy connections and spoofing browser fingerprints.

### Dashboard

The Dashboard is a Google Sheets document containing information about browser profiles. With this table, you can easily manage your profiles, make changes, and track relevant information.

What you can do with the Dashboard:

- **Sorting and Filtering**: Easily find information by sorting and filtering data in the table.

- **Profile Management**: Create and modify profiles, configuring proxies and fingerprinting.

- **Selecting multiple profiles:**: Simply select the desired profiles from the Dashboard for use in the console application. To do this, set the value "X" for the select column in the profile row.

This table serves as a database for the application. Information from the cells is used to open the browser, such as profile name and proxy settings.

The Dashboard makes managing your profiles quick, convenient, and efficient.

<p align="center">
      <img src="https://i.ibb.co/wYQ9jD5/image-2024-02-21-05-23-39.png" >
</p>

The Dashboard can be customized to suit your needs, with additional columns added to track more information. In the example below, four additional parameters are included: Gmail, Twitter, Telegram, and Discord. These indicate the presence of an active session in the profile on each platform. You can easily track the status of your profiles across different platforms directly from the Dashboard.


### Fingerprint

The application uses **Camoufox** for advanced browser fingerprinting and anti-detection. When creating a new profile, Camoufox automatically generates a realistic fingerprint based on your configuration (OS type, screen dimensions, etc.). 

Camoufox leverages **BrowserForge** to generate authentic browser fingerprints that closely mimic real users. The fingerprinting system includes:

- **Automatic Fingerprint Generation**: No external API keys required - fingerprints are generated locally
- **OS Spoofing**: Emulate Windows, macOS, or Linux systems
- **Screen Dimension Randomization**: Configurable screen resolution constraints
- **WebGL/Canvas Fingerprinting**: Sophisticated spoofing to avoid detection
- **Hardware Concurrency**: Realistic CPU core count spoofing
- **GeoIP-based Configuration**: Automatically set timezone, locale, and geolocation based on your proxy IP

The effectiveness of Camoufox's anti-detection has been proven to pass major fingerprinting tests with high trust scores. The browser is specifically designed to evade detection by advanced bot detection systems.

For testing, the following tools can be used:
1. [CreepJS](https://abrahamjuliot.github.io/creepjs/)
2. [FingerprintJS](https://fingerprintjs.github.io/fingerprintjs/)
3. [Incolumitas](https://bot.incolumitas.com/)
4. [Fingerprint.com](https://fingerprint.com/products/bot-detection/)
5. [BrowserScan](https://browserscan.net/)

Camoufox is built on Firefox and provides superior anti-detection compared to Chromium-based solutions, with native support for macOS (including Apple Silicon) and ARM architectures.
      <img src="https://i.ibb.co/zS4C6b4/Behavioral.png" >
</p>
<p align="center">
      <img src="https://i.ibb.co/J5Xdzds/fingerprint-com.png" >
</p>

Certainly, these results are quite subjective, but you can use this data to compare the Antidetect browser with AdsPower. Providing a real assessment of browser masking is challenging, but the free Antidetect browser demonstrates a level comparable to the paid AdsPower.

### Proxy

The browser supports proxies, you can configure them in both the dashboard and the console application. The following connection protocols are available: HTTPS and SOCKS5, you can connect to proxies using login and password. 

**Camoufox automatically configures browser settings based on your proxy:**
- **Timezone & Geolocation**: Automatically detects and sets timezone and geolocation based on the proxy IP address using GeoIP
- **Language & Locale**: Sets appropriate language and locale for the detected location
- **WebRTC Protection**: Built-in WebRTC blocking prevents IP address leakage
- **DNS Leak Prevention**: Ensures all DNS requests go through the proxy

All these features work seamlessly without any additional configuration!
### Cloud
> [!NOTE]
> In development...
>
> 
You have convenient storage options for profile data, both locally and in the cloud. Forget about the limitations of a single device — cloud storage allows you to access your profiles from any device or collaborate within a team. 

For cloud integration, you need a service that provides a virtual disk, displaying the contents of your cloud storage

## Installation and guides


### Step 1: Google spreadsheet

1. Open Google Sheets in your web browser. 
2. Create a copy of the  ["Dashboard"](https://docs.google.com/spreadsheets/d/1Pjpjtm5p0bPSe_dJjwCMa8l5PUCoHooZRP7IFSV_SwU/edit?usp=sharing) template on your drive by following the template link and selecting "File" -> "Make a copy".
3. Rename the copied file as desired, for example, "AntiDashboard".
4. Now you have your own copy of the ["Dashboard"](https://docs.google.com/spreadsheets/d/1Pjpjtm5p0bPSe_dJjwCMa8l5PUCoHooZRP7IFSV_SwU/edit?usp=sharing) template that you can customize and use in your antidetect browser.


### Step 2: Google API

1. Go to the [Google Developers Console](https://console.cloud.google.com/cloud-resource-manager?pli=1)
2. Select your project or create a new one (and then select it)
3. Enable the Sheets API for your project
- In the sidebar on the left, select Enabled APIs & Services
- Click the blue "Enable APIs and Services" button in the top bar
- Search for "sheets"
- Click on ["Google Sheets API"](https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=)
- Click the blue "Enable" button
4. (Optional) Enable the "Google Drive API" for your project - if you want to manage document permissions
- same as above, but search for "drive" and enable the "Google Drive API"

Next, you need to create and connect as a service bot user that belongs to your app.
Follow steps above to set up project and enable sheets API:

- Create a service account for your project
- In the sidebar on the left, select [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials?project=)
- Click blue "+ CREATE CREDENTIALS" and select ["Service account"](https://console.cloud.google.com/iam-admin/serviceaccounts/create?previousPage=&project=) option
- Enter name, description, click "CREATE"
- You can skip permissions, click "CONTINUE" and "DONE"
- In the ['Credentials'](https://console.cloud.google.com/apis/credentials?project=) menu, under the "Service Accounts" section, select the created account and click on it
- In the top menu, select the "Keys" section
- Click on the 'Add key' button and choose "Create new key"
- Select the type as "JSON" and click on "Create"

A JSON file containing the login credentials will be downloaded, which we will need for further use.


### Step 3: Google Drive

1. Download and install [Google Drive](https://workspace.google.com/products/drive/#download) for desktop
2. Add the "My Drive" folder
- Open Google Drive, sign in with your account, and locate the "My Drive" folder in the main interface
3. Set up folder sync settings for "My Drive"
- In Google Drive settings, navigate to Preferences > My Drive
- Choose Sync all files and folders or Sync specific folders to specify files for syncing to your computer
5. Enable offline access for the folder
- Right-click on the "My Drive" folder and select Available offline to ensure access when you’re not connected to the internet
6. Create a folder named "antidetect" in "My Drive"


### Step 4: Environment Configuration Guide

To configure the `.env` file, follow these steps:
1. **Rename** `.env_example` to `.env`
2. **Set the following variables** in the `.env` file:

    ```plaintext
    DIR = ""
    GOOGLEEMAIL = ""
    GOOGLESHEETID = ""
    GOOGLEKEY = ""
    NODE_ENV = "test"
    ```

- **DIR**: The path to the `antidetect` directory on Google Drive (optional if using local mode).
- **GOOGLEEMAIL**: The `client_email` field from the JSON file of your Google Service Account (optional if using local mode).
- **GOOGLESHEETID**: The ID of the Google Sheet. You can find this in the URL on the dashboard page, located between `docs.google.com/spreadsheets/d/` and `/edit?` (optional if using local mode).
- **GOOGLEKEY**: The `private_key` field from the JSON file of your Google Service Account (optional if using local mode).
- **NODE_ENV**: The environment setting. Don't change

> ⚠️ **Note**: The `FPKEY` is no longer required! Camoufox generates fingerprints automatically without external API keys.

> ⚠️ **Note**: Ensure that all sensitive keys and paths are accurately set to prevent configuration issues.

### Running in Local Mode (No Google Sheets Required)

**NEW!** You can now run the application completely locally without any Google Sheets integration. This is perfect for:
- Quick testing and development
- Privacy-focused users who don't want cloud integration
- Simpler setup without Google API configuration

To use local mode, simply:
1. **Skip Steps 1-3** (Google Spreadsheet, Google API, and Google Drive setup)
2. Create a `.env` file with empty values or leave Google-related fields blank:
    ```plaintext
    DIR = ""
    GOOGLEEMAIL = ""
    GOOGLESHEETID = ""
    GOOGLEKEY = ""
    NODE_ENV = "test"
    ```
3. Run the application normally - it will automatically detect local mode and store all data in `storage/profiles.json`

In local mode:
- ✅ All profiles are stored locally in a JSON file
- ✅ No external dependencies or API keys required
- ✅ Full profile management (create, edit, delete)
- ✅ All fingerprinting and proxy features work normally
- ❌ Dashboard/Cloud sync features are disabled (only local storage available)

## How to Start

1. Node JS (version 16 or higher)
2. Clone the repository to your disk
3. **Optional**: Configure `.env` with Google Sheets parameters (or leave empty for local mode)
4. Launch the console (for example, Windows PowerShell, Terminal on macOS)
5. Specify the working directory where you have uploaded the repository in the console using the CD command
    ```
    cd C:\Program Files\brothers
    ```
6. Install packages
   
    ```
    npm install
    ```
7. **Optional but Recommended**: Download Camoufox browser binaries
    ```
    npx camoufox fetch
    ```
    Note: This step may fail in restricted environments. If it fails, Camoufox will attempt to download automatically on first use.

8. Run the software
    ```
    node index
    ```

## Future development

> [!NOTE]
> This section I plan to regularly add and improve the application for users (if there will be any)...
> 



## License

Project **brodev3**/antidetect is distributed under the MIT license.
