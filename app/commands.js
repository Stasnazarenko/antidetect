import inquirer from 'inquirer';
import { timeLog, state } from '../utils.js';
import * as manage from '../scr/manage.js';
import * as db from '../scr/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let create_Profile = async function(){
    let name = false;
    await inquirer.prompt([{
        type: 'input',
        name: 'newProfile',
        message: 'Enter the name of the new profile:',
        prefix: timeLog(),
      },
    ]).then(async (answers) => {
        name = answers.newProfile;
        if (typeof answers.newProfile == "string" && answers.newProfile != "")
            await manage.create_Profile(answers.newProfile, {fingerprint: true});
        else 
            return console.log(timeLog() + 'Invalid name!');
    });
    return name;
};

let setNewProxy = async function(name){
    let proxy = {}
    let answers = await inquirer.prompt([{
        type: 'list',
        name: 'type',
        message: 'Select the protocol of your proxy:',
        prefix: timeLog(),
        choices: [
            'HTTP/HTTPS',
            'SOCKS5',
            new inquirer.Separator(), 
            'Back', 
        ],
      }
    ]);
    switch (answers.type){
        case 'HTTP/HTTPS':
            proxy.type = 'https';
            break;
        case 'SOCKS5':
            proxy.type = 'socks5';
            break;
        case 'Back': 
            return;
    }; 
    answers = await inquirer.prompt([{
        type: 'input',
        name: 'proxy',
        message: 'Enter proxy (ex. 111.01.1.111:2000:Login:Pass):',
        prefix: timeLog(),
    }]);
    if (typeof answers.proxy == "string" && answers.proxy != ""){
        await manage.set_ProfileProxy(name, `${proxy.type}:` + answers.proxy);
        console.log(timeLog() + ' Proxy set');
    }
    else {
        console.log(timeLog() + ' Invalid proxy!');
    };       
};

let rename_Profile = async function(name){
    let answers = await inquirer.prompt([{
        type: 'input',
        name: 'newName',
        message: 'Enter the new name of the profile:',
        prefix: timeLog(),
      },
    ]);
    if (typeof answers.newName == "string" && answers.newName != "")
        await manage.rename_Profile(name, answers.newName);
    else {
        console.log(timeLog() + ' Invalid name!');
        return name;
    };
    return answers.newName;
};

let openSelected = async function(){
    let profiles = await db.get_Selected();
    console.log(timeLog() + 'Selected profiles: ' + profiles);
    for (let i = 0; i < profiles.length; i++){
        await manage.open_Profile(profiles[i]);
    };
};

let deleteSelected = async function(){
    let profiles = await db.get_Selected();
    console.log(timeLog() + 'Selected profiles: ' + profiles);
    for (let i = 0; i < profiles.length; i++){
        manage.delete_Profile(profiles[i]);
    };
};

let newEngine = function(){
    let count = db.get_Engines().length+1;
    const parentDir = path.resolve(__dirname, '..');
    fs.mkdirSync(parentDir + '/engines/data' + count, { recursive: true });
    console.log(timeLog() + 'Created engine: ' + 'data' + count);
};

let setEngine = function(name){
    state.engine = name;
    console.log(timeLog() + 'Selected engine: ' + name);
};

let close_Profile = async function(name) {
    try {
        await manage.close_Profile(name);
    } catch (error) {
        console.log(timeLog() + ` Error closing profile: ${error.message}`);
    }
};

let cleanup_DeadBrowsers = async function() {
    try {
        const result = await manage.cleanup_DeadBrowsers();
        console.log(timeLog() + ` Cleaned up ${result.cleaned || 0} dead browsers`);
    } catch (error) {
        console.log(timeLog() + ` Error cleaning up: ${error.message}`);
    }
};

export { setNewProxy, rename_Profile, create_Profile, openSelected, deleteSelected, newEngine, setEngine, close_Profile, cleanup_DeadBrowsers };
