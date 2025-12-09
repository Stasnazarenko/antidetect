import 'dotenv/config.js';

const cloudDir = process.env.DIR;
const storageDir = process.cwd() + '/storage/';
const tags = ['Email', 'Gmail', 'Twitter', 'Metamask', 'Phantom', 'Discord'];
const googleEmail = process.env.GOOGLEEMAIL;
const googleKey = process.env.GOOGLEKEY;
const googleSheetID = process.env.GOOGLESHEETID;
const useGoogleSheets = !!(googleEmail && googleKey && googleSheetID);

export { cloudDir, storageDir, tags, googleEmail, googleKey, googleSheetID, useGoogleSheets };