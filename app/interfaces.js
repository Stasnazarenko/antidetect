import inquirer from 'inquirer';
import * as manage from '../scr/manage.js';
import { printLogo, timeLog, state } from '../utils.js';
import * as db from '../scr/db.js';
import * as commands from './commands.js';
import * as config from '../config.js';

let start = async function(){
    console.clear();
    printLogo();
    
    // Build menu choices based on configuration
    let menuChoices = [
        new inquirer.Separator(), 
        'Profiles',
    ];
    
    // Only show Dashboard option if Google Sheets is configured
    if (config.useGoogleSheets) {
        menuChoices.push('Dashboard');
    }
    
    menuChoices.push(
        'Multiprocessing',
        'About',
        new inquirer.Separator(), 
        'Exit'
    );
    
    // Show storage mode info
    if (!config.useGoogleSheets) {
        console.log(timeLog() + 'Running in LOCAL MODE (no Google Sheets integration)');
    }
    
    inquirer.prompt([
    {
      type: 'list',
      pageSize: 20,
      name: 'section',
      message: 'Select a section:',
      prefix: timeLog(),
      choices: menuChoices,
    }
    ]).then(async (answers) => {
        switch(answers.section) {
            case 'Multiprocessing':
                multiprocessing();
                break;
            case 'Exit':
                process.exit(1);
            case 'Profiles':
                return storage_Type();
            case 'Dashboard':
                return dashboard();
        };
  });
};

let multiprocessing = async function(){
    let choices = db.get_Engines();
    choices.unshift(new inquirer.Separator(), 'New engine');
    choices.push(new inquirer.Separator(), 'Back');
    inquirer.prompt([
        {
          type: 'list',
          pageSize: 20,
          name: 'multiprocessing',
          message: 'Select a menu item:',
          prefix: timeLog(),
          choices: choices,
        }
    ]).then(async (answers) => {
        switch(answers.multiprocessing){
            case 'New engine':
                commands.newEngine();
                return multiprocessing();
            case 'Back':
                return start();
        };
        commands.setEngine(answers.multiprocessing);
        return multiprocessing();
    });
};

let dashboard = async function(){
    inquirer.prompt([
        {
          type: 'list',
          pageSize: 20,
          name: 'dashboard',
          message: 'Select a menu item:',
          prefix: timeLog(),
          choices: [
            new inquirer.Separator(), 
            'Connect', 
            new inquirer.Separator(), 
            'Back'
          ],
        }
    ]).then(async (answers) => {
        switch(answers.dashboard){
            case 'Connect':
                console.log(`${timeLog()}`+
                'A link for authorization in the Google API will be sent shortly. Please log in with the account that owns the spreadsheet to obtain a service account token for interaction with the Google API through your application.')
                state.dashboard = 'Cloud';
                break;
            case 'Back':
                return start();
        };
        return profiles_Menu();
    });
};

let storage_Type = async function(){
    // If Google Sheets is not configured, force Local mode
    if (!config.useGoogleSheets) {
        state.storageType = 'Local';
        return profiles_Menu();
    }
    
    inquirer.prompt([
        {
          type: 'list',
          pageSize: 20,
          name: 'storageType',
          message: 'Select a type of storage:',
          prefix: timeLog(),
          choices: [
            new inquirer.Separator(), 
            'Cloud', 
            'Local', 
            new inquirer.Separator(), 
            'Back'
          ],
        }
    ]).then(async (answers) => {
        switch(answers.storageType){
            case 'Cloud':
                state.storageType = 'Cloud';
                break;
            case 'Local':
                state.storageType = 'Local';
                break;
            case 'Back':
                return start();
        };
        return profiles_Menu();
    });
};

let profiles_Menu = async function(){
    inquirer.prompt([
        {
            type: 'list',
            pageSize: 20,
            name: 'profileAction',
            message: 'Select a menu item:',
            prefix: timeLog(),
            choices: [
                new inquirer.Separator(),
                'New profile',
                'List of profiles',
                'Selected in the table',
                'Cleanup dead browsers',
                new inquirer.Separator(),
                'Back'
            ],
        }
    ]).then(async (answers) => {
        switch(answers.profileAction){
            case 'New profile':
                let name = await commands.create_Profile();
                if (name != false)
                    return profile_Action(name);
                else
                    return profiles_Menu(name);
            case 'List of profiles':
                return profiles();
            case 'Selected in the table':
                return selected_Actions();
            case 'Cleanup dead browsers':
                await commands.cleanup_DeadBrowsers();
                return profiles_Menu();
            case 'Back':
                return start();
        };
    });
};


let profiles = async function(){
    let names = await db.get_Profiles();
    names.push(new inquirer.Separator(), 'Back');
    names.unshift(new inquirer.Separator());
    inquirer.prompt([
    {
      type: 'rawlist',
      pageSize: 20,
      name: 'profile',
      message: 'Select a profile:',
      prefix: timeLog(),
      choices: names,
    }]).then(async (answers) => {
        switch(answers.profile){
            case 'Back':
                return profiles_Menu();
        };
        return profile_Action(answers.profile);
    });
};

let selected_Actions = async function(){
    await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: 'Select an action:',
        prefix: timeLog(),
        choices: [
            new inquirer.Separator(), 
            'Open selected profiles',
            'Delete selected profiles',
            new inquirer.Separator(), 
            'Back', 
        ]
    }]).then(async (answers) => {
        switch(answers.action){
            case 'Open selected profiles':
                await commands.openSelected();
                break;
            case 'Delete selected profiles':
                await manage.deleteSelected();
                break;
            case 'Back':
                return await profiles_Menu();                
        };
        return;
    });
}

let profile_Action = async function (profile){
    let pdata = await db.get_Profile(profile);
    let message;
    let open = await pdata.get('open');
    if (open == true || open == 1)
        message = `Profile: ${profile}\nOpen: true\n`
    else
        message = `Profile: ${profile}\nOpen: false\n`

    let proxy = await pdata.get('proxy');
    if (proxy == false || proxy == undefined)
        message = message + `Proxy: false The real ip\n`
    else {
        proxy = proxy.split(':');
        proxy = proxy[0] + ':' + proxy[1];
        let proxyType = await pdata.get('proxyType');
        message = message + `Proxy: true
Type: ${proxyType}
IP: ${proxy}\n`;
    }
    let fingerprint = await pdata.get('fingerprint');
    if (fingerprint == false || fingerprint == undefined)
        message = message + `Fingerprint: false\n`;
    else
        message = message + `Fingerprint: true\n`;

    // Динамічний список опцій
    let actionChoices = [new inquirer.Separator()];

    if (open == true || open == 1) {
        actionChoices.push('Close');
    } else {
        actionChoices.push('Open');
    }

    actionChoices.push(
        'Proxy',
        'Fingerprint',
        'Rename',
        'Delete',
        new inquirer.Separator(),
        'Back',
        'Back to menu'
    );

    inquirer.prompt([{
        type: 'list',
        name: 'action',
        pageSize: 31,
        message: message + 'Select an action:',
        prefix: timeLog(),
        choices: actionChoices,
    }]).then(async (answers) => {
        switch(answers.action) {
            case 'Close':
                await commands.close_Profile(profile);
                return profile_Action(profile);
            case 'Open':
                await manage.open_Profile(profile);
                return profile_Action(profile);
            case 'Back':
                return profiles();
            case 'Back to menu':
                return start();
            case 'Proxy':
                return proxy_Profile(profile);
            case 'Fingerprint':
                return await fp_Profile(profile);
            case 'Rename':
                let name = await commands.rename_Profile(profile);
                return profile_Action(name);
            case 'Delete':
                await manage.delete_Profile(profile);
                return profiles();
        }
    });
};

let proxy_Profile = async function(name){
    let fpdata = await db.get_Profile(name);
    let proxy = await fpdata.get('proxy');
    let proxyType = await fpdata.get('proxyType');
    let message;
    if (proxy == false || proxy == undefined){
        message = `Proxy: false. The real ip\n${timeLog()} Select an action:`
    }
    else {
        let ip = proxy.split(":");
        proxy = ip[0] + ':' + ip[1];
        message = `Proxy: True.
Type: ${proxyType}
IP: ${proxy}
${timeLog()} Select an action:`;
    };
    await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: message,
        prefix: timeLog(),
        choices: [
            new inquirer.Separator(), 
            'Set new proxy',
            'Delete proxy',
            new inquirer.Separator(), 
            'Back', 
        ]
    }]).then(async (answers) => {
        switch(answers.action){
            case 'Set new proxy':
                await commands.setNewProxy(name);
                break;
            case 'Delete proxy':
                await manage.delete_ProfileProxy(name);
                break;
            case 'Back':
                return await profile_Action(name);                
        };
        return await proxy_Profile(name);
    });
};

let fp_Profile = async function(name){
    let fpdata = await db.get_Profile(name);
    let fingerprint = await fpdata.get('fingerprint');
    if (fingerprint == false || fingerprint == undefined){
        inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: `Fingerprint: False\n${timeLog()} Select an action:`,
            prefix: timeLog(),
            choices: [
                new inquirer.Separator(), 
                'Set new fingerprint',
                new inquirer.Separator(), 
                'Back', 
            ]}]).then(async (answers) => {
            if (answers.action == "Set new fingerprint"){
                await manage.change_ProfileFP(name);
                console.log(timeLog() + ' Fingerprint set');
                return profile_Action(name);
            };
            if (answers.action == "Back")
                return profile_Action(name);
            });
    }
    else{
        inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: `Fingerprint: True\n${timeLog()} Select an action:`,
            prefix: timeLog(),
            choices: [
                new inquirer.Separator(), 
              'Change fingerprint',
              'Delete fingerprint',
              new inquirer.Separator(), 
              'Back', 
            ]
        }]).then(async (answers) => {
            if (answers.action == "Change fingerprint"){
                await manage.change_ProfileFP(name);
                console.log(timeLog() + ' Fingerprint changed');
                return profile_Action(name);
            };
            if (answers.action == "Delete fingerprint"){
                await manage.delete_ProfileFP(name);
                console.log(timeLog() + ' Fingerprint deleted');
                return profile_Action(name);
            };
            if (answers.action == "Back")
                return profile_Action(name);
        });
    };
};


export { start };


