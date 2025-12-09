import * as config from '../config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let update_Profile, check_Profile, get_Profile, open_Profile, close_Profile, delete_Profile, get_Selected, get_Profiles, get_Engines;

// Use local database if Google Sheets is not configured
if (config.useGoogleSheets) {
    // Use Google Sheets backend
    const { JWT } = await import('google-auth-library');
    const { GoogleSpreadsheet } = await import('google-spreadsheet');
    const { RateLimiter } = await import('limiter');

    const auth = new JWT({
        email: config.googleEmail,
        key: config.googleKey,
        scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        ]
    });

    const doc = new GoogleSpreadsheet(config.googleSheetID, auth);
    const limiter = new RateLimiter({ tokensPerInterval: 45, interval: "minute" });

    let db = {};
    let sheet;

    async function connect(){
        await doc.loadInfo(); 
        sheet = doc.sheetsByIndex[0];
        await sheet.loadHeaderRow(1);
    };

    check_Profile = async function(name){
        await limiter.removeTokens(4);
        await connect();
        let rows = await sheet.getRows();
        for (let i = 0; i < rows.length; i++){
            if (rows[i].get('name') == name){
                return true;
            };
        };
        return false;
    };

    update_Profile = async function(name, data){
        await limiter.removeTokens(5);
        await connect();
        let check = await check_Profile(name);
        if (check == false)
            await sheet.addRow(data, {insert: true})
        else {
            let row = await get_Profile(name);
            await row.assign(data);
            await row.save();
        };  
    };

    get_Profile = async function(name){
        await limiter.removeTokens(4);
        await connect();
        let rows = await sheet.getRows();
        for (let i = 0; i < rows.length; i++){
            if (rows[i].get('name') == name)
                return rows[i];
        };
        return false;
    };

    open_Profile = async function(name){
        await limiter.removeTokens(4);
        await connect();
        let profile = await get_Profile(name);
        await profile.assign({open: 1});
        await profile.save();
    };

    close_Profile = async function(name){
        await limiter.removeTokens(3);
        await connect();
        let profile = await get_Profile(name);
        await profile.assign({open: ' '});
        await profile.save();
    };

    delete_Profile = async function(name){
        await limiter.removeTokens(2);
        let row = await get_Profile(name);
        if (row)
            await row.delete();
    };

    get_Profiles = async function(){
        await limiter.removeTokens(2);
        await connect();
        let arr = [];
        let rows = await sheet.getRows();
        rows.forEach(async row => {
            arr.push(await row.get('name'));
        });
        return arr;
    };

    get_Selected = async function(){
        await limiter.removeTokens(3);
        await connect();
        let res = [];
        let rows = await sheet.getRows();
        for (let i = 0; i < rows.length; i++){
            if (await rows[i].get('select') == 'X'){
                let name = await rows[i].get('name');
                res.push(name);
            };
        };
        return res;
    };

    get_Engines = function(){
        const parentDir = path.resolve(__dirname, '..');
        const engines = fs.readdirSync(parentDir + '/engines');
        return engines;
    };
} else {
    // Use local database backend
    console.log('Using local database mode (Google Sheets not configured)');
    const localDB = await import('./db-local.js');
    
    update_Profile = localDB.update_Profile;
    check_Profile = localDB.check_Profile;
    get_Profile = localDB.get_Profile;
    open_Profile = localDB.open_Profile;
    close_Profile = localDB.close_Profile;
    delete_Profile = localDB.delete_Profile;
    get_Selected = localDB.get_Selected;
    get_Profiles = localDB.get_Profiles;
    get_Engines = localDB.get_Engines;
}

export { update_Profile, check_Profile, get_Profile, open_Profile, close_Profile, delete_Profile, get_Selected, get_Profiles, get_Engines };
