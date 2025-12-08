#!/usr/bin/env python3
"""
Camoufox bridge for Node.js antidetect browser.
Launches Camoufox with fingerprint configuration and returns Playwright connection URL.
"""
import sys
import json
import asyncio
from camoufox.async_api import Camoufox

async def launch_browser(config):
    """Launch Camoufox with configuration from Node.js"""
    
    # Parse configuration
    profile_dir = config.get('profileDir')
    proxy_config = config.get('proxy', {})
    fingerprint = config.get('fingerprint', {})
    
    # Build Camoufox options
    launch_options = {
        'headless': False,
        'firefox_user_prefs': {
            'privacy.resistFingerprinting': False,  # We handle fingerprinting ourselves
        }
    }
    
    # Set profile directory for persistent context
    if profile_dir:
        launch_options['user_data_dir'] = profile_dir
    
    # Configure proxy
    if proxy_config.get('server'):
        launch_options['proxy'] = {
            'server': proxy_config['server']
        }
        if proxy_config.get('username'):
            launch_options['proxy']['username'] = proxy_config['username']
            launch_options['proxy']['password'] = proxy_config['password']
    
    # Configure fingerprint
    camoufox_config = {}
    
    if fingerprint.get('screen'):
        screen = fingerprint['screen']
        camoufox_config['screen'] = {
            'min_width': screen.get('minWidth', 1440),
            'max_width': screen.get('maxWidth', 1920),
            'min_height': screen.get('minHeight', 900),
            'max_height': screen.get('maxHeight', 1080)
        }
    
    if fingerprint.get('os'):
        # Pick random OS from list
        import random
        camoufox_config['os'] = random.choice(fingerprint['os'])
    
    if fingerprint.get('hardwareConcurrency'):
        hc = fingerprint['hardwareConcurrency']
        import random
        camoufox_config['hardwareConcurrency'] = random.randint(
            hc.get('min', 2), 
            hc.get('max', 16)
        )
    
    # Enable GeoIP for automatic timezone/locale
    if fingerprint.get('geoip'):
        camoufox_config['geoip'] = True
    
    # Launch browser
    try:
        browser = await Camoufox(
            config=camoufox_config,
            **launch_options,
            # Anti-detect features
            humanize=True,          # Human-like cursor movement
            block_webrtc=True,      # Prevent WebRTC IP leaks
        )
        
        # Get connection info
        ws_endpoint = browser.ws_endpoint
        
        # Return connection details to Node.js
        result = {
            'success': True,
            'wsEndpoint': ws_endpoint,
            'browserVersion': 'Firefox 142.0.1'
        }
        print(json.dumps(result))
        sys.stdout.flush()
        
        # Keep process alive until browser closes
        while browser.is_connected():
            await asyncio.sleep(1)
            
    except Exception as e:
        result = {
            'success': False,
            'error': str(e)
        }
        print(json.dumps(result), file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: camoufox_bridge.py <config_json>', file=sys.stderr)
        sys.exit(1)
    
    config_json = sys.argv[1]
    config = json.loads(config_json)
    
    asyncio.run(launch_browser(config))
