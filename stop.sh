#!/bin/bash

# Kill all Node.js and Electron processes related to Antidetect
ps aux | grep -E "node|Electron" | grep -v grep | awk '{print $2}' | xargs kill -9 2>/dev/null
sleep 2
echo "✅ Killed all Node/Electron"

