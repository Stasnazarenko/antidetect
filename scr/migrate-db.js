#!/usr/bin/env node

/**
 * Скрипт для міцеляціі БД - додає missing поля до всіх профілів
 * node scr/migrate-db.js
 */

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '../storage/profiles.json');

function readDB() {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function migrateDB() {
    console.log('🔄 Starting database migration...');

    const db = readDB();
    let migrated = 0;

    db.profiles = db.profiles.map(profile => {
        // Додаємо missing поля
        if (!('open' in profile)) {
            profile.open = false;
            migrated++;
        }

        if (!('proxy' in profile)) {
            profile.proxy = false;
        }

        if (!('proxyType' in profile)) {
            profile.proxyType = 'http';
        }

        if (!('select' in profile)) {
            profile.select = ' ';
        }

        if (!('fingerprint' in profile)) {
            profile.fingerprint = null;
        }

        return profile;
    });

    writeDB(db);

    console.log(`✅ Migration complete!`);
    console.log(`   Total profiles: ${db.profiles.length}`);
    console.log(`   Fixed: ${migrated}`);
}

migrateDB();

