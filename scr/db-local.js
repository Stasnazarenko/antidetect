import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as config from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Local JSON database file
const DB_FILE = path.join(__dirname, '..', 'storage', 'profiles.json');

// Ensure storage directory exists
function ensureStorageDir() {
    const storageDir = path.join(__dirname, '..', 'storage');
    if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
    }
}

// Initialize database file if it doesn't exist
function initDB() {
    ensureStorageDir();
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ profiles: [] }, null, 2));
    }
}

// Read database
function readDB() {
    initDB();
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
}

// Write database
function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Profile wrapper to mimic Google Sheets API
class ProfileRow {
    constructor(profile, index) {
        this.profile = profile;
        this.index = index;
    }

    get(field) {
        return this.profile[field];
    }

    async assign(data) {
        Object.assign(this.profile, data);
    }

    async save() {
        const db = readDB();
        db.profiles[this.index] = this.profile;
        writeDB(db);
    }

    async delete() {
        const db = readDB();
        db.profiles.splice(this.index, 1);
        writeDB(db);
    }
}

async function check_Profile(name) {
    const db = readDB();
    return db.profiles.some(profile => profile.name === name);
}

async function update_Profile(name, data) {
    const db = readDB();
    const index = db.profiles.findIndex(profile => profile.name === name);
    
    if (index === -1) {
        // Profile doesn't exist, create it
        db.profiles.push(data);
    } else {
        // Profile exists, update it
        Object.assign(db.profiles[index], data);
    }
    
    writeDB(db);
}

async function get_Profile(name) {
    const db = readDB();
    const index = db.profiles.findIndex(profile => profile.name === name);
    
    if (index === -1) {
        return false;
    }
    
    return new ProfileRow(db.profiles[index], index);
}

async function open_Profile(name) {
    const profile = await get_Profile(name);
    if (profile) {
        await profile.assign({ open: 1 });
        await profile.save();
    }
}

async function delete_Profile(name) {
    const db = readDB();
    const index = db.profiles.findIndex(profile => profile.name === name);
    
    if (index !== -1) {
        db.profiles.splice(index, 1);
        writeDB(db);
    }
}

async function get_Profiles() {
    const db = readDB();
    return db.profiles.map(profile => profile.name);
}

async function get_Selected() {
    const db = readDB();
    return db.profiles
        .filter(profile => profile.select === 'X')
        .map(profile => profile.name);
}

function get_Engines() {
    const parentDir = path.resolve(__dirname, '..');
    const enginesDir = path.join(parentDir, 'engines');
    
    if (!fs.existsSync(enginesDir)) {
        return [];
    }
    
    return fs.readdirSync(enginesDir);
}

async function close_Profile(name) {
    const profile = await get_Profile(name);
    if (profile) {
        await profile.assign({ open: false });
        await profile.save();
    }
}

export { update_Profile, check_Profile, get_Profile, open_Profile, close_Profile, delete_Profile, get_Selected, get_Profiles, get_Engines };
