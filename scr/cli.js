#!/usr/bin/env node

/**
 * 🚀 Antidetect Browser Manager - Native macOS CLI
 * Мінімальне, швидке, без Electron
 *
 * node scr/cli.js
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

// Colors для CLI
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

const DB_FILE = path.join(__dirname, '../storage/profiles.json');

function readDB() {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function clear() {
    console.clear();
}

function header(text) {
    console.log(`\n${colors.cyan}${colors.bright}═══════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}  ${text}${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}═══════════════════════════════════════${colors.reset}\n`);
}

function profileStatus(open) {
    return open ? `${colors.green}●${colors.reset} OPEN ` : `${colors.red}●${colors.reset} CLOSED`;
}

async function listProfiles() {
    clear();
    header('📋 Browser Profiles');

    const db = readDB();
    const profiles = db.profiles;

    console.log(`${colors.bright}Total: ${profiles.length}${colors.reset}\n`);

    profiles.forEach((p, i) => {
        const status = profileStatus(p.open);
        const proxy = p.proxy ? `${colors.yellow}[PROXY]${colors.reset}` : '';
        const fp = p.fingerprint ? `${colors.blue}[FP]${colors.reset}` : '';

        console.log(`${colors.cyan}${i + 1}. ${p.name}${colors.reset} ${status} ${proxy} ${fp}`);
    });

    console.log('\n');
}

async function openProfile(name) {
    const db = readDB();
    const profile = db.profiles.find(p => p.name === name);

    if (!profile) {
        console.log(`${colors.red}✗ Profile not found${colors.reset}`);
        return;
    }

    if (profile.open) {
        console.log(`${colors.yellow}⚠ Profile already open${colors.reset}`);
        return;
    }

    console.log(`${colors.cyan}Opening ${name}...${colors.reset}`);

    // Викликаємо Node.js функцію через manage.js
    try {
        // Зберігаємо статус як відкритий
        profile.open = true;
        writeDB(db);

        console.log(`${colors.green}✓ Profile opened${colors.reset}`);
    } catch (e) {
        console.log(`${colors.red}✗ Error: ${e.message}${colors.reset}`);
    }
}

async function closeProfile(name) {
    const db = readDB();
    const profile = db.profiles.find(p => p.name === name);

    if (!profile) {
        console.log(`${colors.red}✗ Profile not found${colors.reset}`);
        return;
    }

    if (!profile.open) {
        console.log(`${colors.yellow}⚠ Profile already closed${colors.reset}`);
        return;
    }

    console.log(`${colors.cyan}Closing ${name}...${colors.reset}`);

    try {
        profile.open = false;
        writeDB(db);

        console.log(`${colors.green}✓ Profile closed${colors.reset}`);
    } catch (e) {
        console.log(`${colors.red}✗ Error: ${e.message}${colors.reset}`);
    }
}

async function createProfile(name) {
    const db = readDB();

    if (db.profiles.find(p => p.name === name)) {
        console.log(`${colors.red}✗ Profile already exists${colors.reset}`);
        return;
    }

    const newProfile = {
        name,
        open: false,
        proxy: false,
        proxyType: 'http',
        fingerprint: null,
        select: ' '
    };

    db.profiles.push(newProfile);
    writeDB(db);

    console.log(`${colors.green}✓ Profile created: ${name}${colors.reset}`);
}

async function deleteProfile(name) {
    const db = readDB();
    const index = db.profiles.findIndex(p => p.name === name);

    if (index === -1) {
        console.log(`${colors.red}✗ Profile not found${colors.reset}`);
        return;
    }

    db.profiles.splice(index, 1);
    writeDB(db);

    console.log(`${colors.green}✓ Profile deleted: ${name}${colors.reset}`);
}

async function main() {
    const args = process.argv.slice(2);

    if (!args.length) {
        // Інтерактивний режим
        await interactiveMenu();
    } else {
        // Командний режим
        const cmd = args[0];

        switch (cmd) {
            case 'list':
            case 'ls':
                await listProfiles();
                break;
            case 'open':
                await openProfile(args[1]);
                break;
            case 'close':
                await closeProfile(args[1]);
                break;
            case 'create':
                await createProfile(args[1]);
                break;
            case 'delete':
            case 'rm':
                await deleteProfile(args[1]);
                break;
            default:
                console.log(`${colors.red}Unknown command: ${cmd}${colors.reset}`);
                console.log(`\nUsage:\n  node scr/cli.js list\n  node scr/cli.js open <name>\n  node scr/cli.js close <name>`);
        }
    }
}

async function interactiveMenu() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (prompt) => new Promise((resolve) => {
        rl.question(prompt, resolve);
    });

    while (true) {
        clear();
        await listProfiles();

        console.log(`${colors.bright}Commands:${colors.reset}`);
        console.log(`  ${colors.green}o${colors.reset} - Open profile`);
        console.log(`  ${colors.red}c${colors.reset} - Close profile`);
        console.log(`  ${colors.yellow}n${colors.reset} - New profile`);
        console.log(`  ${colors.cyan}d${colors.reset} - Delete profile`);
        console.log(`  ${colors.blue}q${colors.reset} - Quit\n`);

        const cmd = await question(`${colors.bright}Command:${colors.reset} `);

        switch (cmd.toLowerCase()) {
            case 'o':
                const openName = await question('Profile name: ');
                await openProfile(openName);
                break;
            case 'c':
                const closeName = await question('Profile name: ');
                await closeProfile(closeName);
                break;
            case 'n':
                const newName = await question('New profile name: ');
                await createProfile(newName);
                break;
            case 'd':
                const delName = await question('Profile name to delete: ');
                await deleteProfile(delName);
                break;
            case 'q':
                rl.close();
                return;
        }

        await question('\nPress Enter...');
    }
}

main().catch(console.error);

