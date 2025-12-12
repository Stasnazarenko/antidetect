#!/bin/bash
# restart-server.sh - рестартує сервер

pkill -f "node server.js" 2>/dev/null
sleep 2
cd /Users/stasnazarenko/Documents/Crypto/Ant/antidetect
node server.js

