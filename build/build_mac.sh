#!/usr/bin/env bash
# ============================================================
# Build script — Email Automation desktop app for macOS
# Output: dist/EmailAutomation.app  +  dist/EmailAutomation.dmg
# ============================================================
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=== [1/4] Building React frontend ==="
cd apps/dashboard
npm install --silent
VITE_API_URL="http://127.0.0.1:8000" npm run build
cd "$PROJECT_ROOT"

echo "=== [2/4] Installing Python dependencies ==="
pip install -r backend/requirements.txt --quiet

echo "=== [3/4] Running PyInstaller ==="
pyinstaller build/app.spec \
  --distpath dist \
  --workpath build/pyinstaller_work \
  --noconfirm

echo "=== [4/4] Creating DMG installer ==="
APP_PATH="dist/EmailAutomation.app"
DMG_PATH="dist/EmailAutomation.dmg"

if command -v create-dmg &>/dev/null; then
  create-dmg \
    --volname "Email Automation" \
    --window-pos 200 120 \
    --window-size 600 400 \
    --icon-size 100 \
    --icon "EmailAutomation.app" 150 190 \
    --hide-extension "EmailAutomation.app" \
    --app-drop-link 450 190 \
    "$DMG_PATH" \
    "$APP_PATH"
else
  # Fallback: simple DMG via hdiutil (no fancy layout)
  hdiutil create \
    -volname "Email Automation" \
    -srcfolder "$APP_PATH" \
    -ov -format UDZO \
    "$DMG_PATH"
fi

echo ""
echo "✓ Build complete!"
echo "  App:  $PROJECT_ROOT/$APP_PATH"
echo "  DMG:  $PROJECT_ROOT/$DMG_PATH"
