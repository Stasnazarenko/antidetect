#!/bin/bash

# 🚀 Antidetect Browser Manager - Easy Start Script

echo "🚀 Starting Antidetect Browser Manager..."
echo ""

cd "$(dirname "$0")"

# Проверяем выбор интерфейса
if [ "$1" = "web" ] || [ "$1" = "" ]; then
    echo "📱 Starting Web UI..."
    echo "Open: http://localhost:3000"
    echo ""
    node server.js

elif [ "$1" = "macos" ]; then
    echo "🍎 Starting macOS Native GUI..."
    python3 scr/macos_gui.py

elif [ "$1" = "electron" ]; then
    echo "⚛️  Starting Electron App..."
    npm install electron --save-dev
    npm run dev

elif [ "$1" = "help" ]; then
    echo "Usage: ./start.sh [option]"
    echo ""
    echo "Options:"
    echo "  web       - Start Web UI (default)"
    echo "  macos     - Start macOS native GUI (requires PyQt6)"
    echo "  electron  - Start Electron app (requires npm install)"
    echo "  help      - Show this help"
    echo ""
    echo "Installation:"
    echo "  pip3 install PyQt6  # For macOS GUI"
    echo "  npm install         # For Electron"
    echo ""

else
    echo "Unknown option: $1"
    echo "Run: ./start.sh help"
fi
