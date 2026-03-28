#!/bin/bash
# ─── Float — Launch Development Mode ───
# Double-click this file or run: ./dev.sh
# Opens the native Tauri app with hot reload.

cd "$(dirname "$0")"

# Check dependencies
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Install from https://nodejs.org/"
    exit 1
fi

if ! command -v rustc &> /dev/null; then
    echo "❌ Rust not found. Install from https://rustup.rs/"
    exit 1
fi

# Install npm deps if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "🚀 Launching Float in dev mode..."
npm run tauri dev
