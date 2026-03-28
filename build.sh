#!/bin/bash
# ─── Float — Build Native App ───
# Run this to produce a double-clickable .app / .dmg
# Output goes to: src-tauri/target/release/bundle/

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

echo "🔨 Building Float..."
npm run tauri build

echo ""
echo "✅ Done! Your app is at:"
echo "   src-tauri/target/release/bundle/"
echo ""
echo "On macOS, look for the .dmg file — double-click to install."
open src-tauri/target/release/bundle/dmg 2>/dev/null || true
