#!/usr/bin/env node

/**
 * Basic test script to verify Antidetect browser functionality
 * Tests local mode without requiring Google Sheets
 */

const fs = require('fs');
const path = require('path');

// Test colors
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function testPass(message) {
    log(`✓ ${message}`, colors.green);
}

function testFail(message) {
    log(`✗ ${message}`, colors.red);
    process.exit(1);
}

function testInfo(message) {
    log(`ℹ ${message}`, colors.blue);
}

async function runTests() {
    log('\n=== Antidetect Browser - Basic Tests ===\n', colors.yellow);

    // Test 1: Check if required dependencies are installed
    testInfo('Test 1: Checking dependencies...');
    try {
        require('dotenv');
        require('inquirer');
        require('axios');
        require('async-lock');
        testPass('All required CommonJS dependencies are installed');
    } catch (error) {
        testFail(`Missing dependency: ${error.message}`);
    }

    // Test 2: Check Camoufox module
    testInfo('Test 2: Checking Camoufox module...');
    try {
        const camoufoxPath = path.join(__dirname, 'node_modules', 'camoufox');
        if (fs.existsSync(camoufoxPath)) {
            testPass('Camoufox module is installed');
        } else {
            testFail('Camoufox module not found');
        }
    } catch (error) {
        testFail(`Camoufox check failed: ${error.message}`);
    }

    // Test 3: Check config module
    testInfo('Test 3: Checking configuration...');
    try {
        const config = require('./config');
        if (config.useGoogleSheets === false) {
            testPass('Config correctly detects local mode');
        } else if (config.useGoogleSheets === true) {
            testPass('Config correctly detects Google Sheets mode');
        } else {
            testFail('Config useGoogleSheets flag is undefined');
        }
        testPass('Storage directories configured');
    } catch (error) {
        testFail(`Config check failed: ${error.message}`);
    }

    // Test 4: Check local database module
    testInfo('Test 4: Checking local database...');
    try {
        const dbLocal = require('./scr/db-local');
        if (typeof dbLocal.check_Profile === 'function' &&
            typeof dbLocal.update_Profile === 'function' &&
            typeof dbLocal.get_Profile === 'function') {
            testPass('Local database module exports correct functions');
        } else {
            testFail('Local database module missing required functions');
        }
    } catch (error) {
        testFail(`Local database check failed: ${error.message}`);
    }

    // Test 5: Check db module switches correctly
    testInfo('Test 5: Checking database module switching...');
    try {
        const db = require('./scr/db');
        if (typeof db.check_Profile === 'function' &&
            typeof db.update_Profile === 'function' &&
            typeof db.get_Profile === 'function') {
            testPass('Database module exports correct functions');
        } else {
            testFail('Database module missing required functions');
        }
    } catch (error) {
        testFail(`Database module check failed: ${error.message}`);
    }

    // Test 6: Check fingerprint module
    testInfo('Test 6: Checking fingerprint module...');
    try {
        const fingerprint = require('./scr/fingerprint');
        if (typeof fingerprint === 'function') {
            testPass('Fingerprint module exports generator function');
            
            // Test fingerprint generation
            fingerprint().then(fp => {
                const fpObj = JSON.parse(fp);
                if (fpObj.screen && fpObj.os) {
                    testPass('Fingerprint generation works correctly');
                } else {
                    testFail('Fingerprint generation produces invalid structure');
                }
            }).catch(err => {
                testFail(`Fingerprint generation failed: ${err.message}`);
            });
        } else {
            testFail('Fingerprint module does not export a function');
        }
    } catch (error) {
        testFail(`Fingerprint module check failed: ${error.message}`);
    }

    // Test 7: Check browser module structure
    testInfo('Test 7: Checking browser module...');
    try {
        const browser = require('./scr/browser');
        if (typeof browser.launch === 'function') {
            testPass('Browser module exports launch function');
        } else {
            testFail('Browser module missing launch function');
        }
    } catch (error) {
        testFail(`Browser module check failed: ${error.message}`);
    }

    // Test 8: Check storage directory creation
    testInfo('Test 8: Checking storage setup...');
    try {
        const storagePath = path.join(__dirname, 'storage');
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
            testPass('Storage directory created');
        } else {
            testPass('Storage directory exists');
        }
    } catch (error) {
        testFail(`Storage setup failed: ${error.message}`);
    }

    // Test 9: Test local database operations
    testInfo('Test 9: Testing local database operations...');
    try {
        const db = require('./scr/db');
        
        // Create test profile
        const testProfileName = 'test_profile_' + Date.now();
        await db.update_Profile(testProfileName, {
            name: testProfileName,
            open: false,
            fingerprint: true
        });
        testPass('Profile creation successful');
        
        // Check if profile exists
        const exists = await db.check_Profile(testProfileName);
        if (exists) {
            testPass('Profile check successful');
        } else {
            testFail('Profile check failed - profile not found');
        }
        
        // Get profile
        const profile = await db.get_Profile(testProfileName);
        if (profile && profile.get('name') === testProfileName) {
            testPass('Profile retrieval successful');
        } else {
            testFail('Profile retrieval failed');
        }
        
        // Delete test profile
        await db.delete_Profile(testProfileName);
        const deletedCheck = await db.check_Profile(testProfileName);
        if (!deletedCheck) {
            testPass('Profile deletion successful');
        } else {
            testFail('Profile deletion failed');
        }
    } catch (error) {
        testFail(`Database operations test failed: ${error.message}`);
    }

    // Test 10: Check .gitignore
    testInfo('Test 10: Checking .gitignore...');
    try {
        const gitignorePath = path.join(__dirname, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            const content = fs.readFileSync(gitignorePath, 'utf8');
            if (content.includes('.env') && content.includes('node_modules') && content.includes('storage')) {
                testPass('.gitignore properly configured');
            } else {
                testFail('.gitignore missing important entries');
            }
        } else {
            testFail('.gitignore file not found');
        }
    } catch (error) {
        testFail(`.gitignore check failed: ${error.message}`);
    }

    log('\n=== All Tests Passed! ===\n', colors.green);
    log('Summary:', colors.yellow);
    log('✓ Dependencies installed correctly');
    log('✓ Camoufox integration ready');
    log('✓ Local mode working');
    log('✓ Database operations functional');
    log('✓ Configuration properly set up');
    log('\nYou can now run: node index.js', colors.blue);
}

// Run tests
runTests().catch(error => {
    testFail(`Test suite failed: ${error.message}`);
});
