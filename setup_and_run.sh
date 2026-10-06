#!/usr/bin/env bash
set -e

# ==============================================================================
#  Darknet Monitor - One-Command Ubuntu Setup & Execution Script
# ==============================================================================

echo "=================================================================="
echo "🛡️  Darknet Monitor - Auto Setup & Launching on Ubuntu"
echo "=================================================================="

# 1. Ensure Python3 and venv module are available
if ! command -v python3 &> /dev/null; then
    echo "⚙️ Installing Python3, pip, and venv..."
    sudo apt update && sudo apt install -y python3 python3-pip python3-venv
fi

# 2. Ensure Node.js and NPM are available
if ! command -v npm &> /dev/null; then
    echo "⚙️ Installing Node.js & NPM..."
    sudo apt update && sudo apt install -y nodejs npm
fi

# 3. Setup Python Virtual Environment (.venv)
if [ ! -d ".venv" ]; then
    echo "📦 Creating Python virtual environment (.venv)..."
    python3 -m venv .venv
fi

# 4. Install backend dependencies into .venv
echo "📥 Installing backend Python dependencies..."
.venv/bin/python -m pip install --upgrade pip --quiet
.venv/bin/pip install -r backend/requirements.txt --quiet

# 5. Install frontend NPM dependencies
if [ ! -d "frontend/node_modules" ]; then
    echo "📥 Installing frontend NPM dependencies..."
    (cd frontend && npm install --silent)
fi

# 6. Ensure executable permissions on darknet runner
chmod +x darknet darknet.py 2>/dev/null || true

# 7. Start project services
echo "🚀 Launching Darknet Monitor..."
.venv/bin/python darknet.py serve
