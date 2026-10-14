#!/bin/bash
# Pixel Bot for Mac: opens https://pixelbotstudio.net in its own app window.
URL="https://pixelbotstudio.net/start"
for APP in "Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium" "Arc"; do
  if open -Ra "$APP" 2>/dev/null; then
    open -na "$APP" --args --app="$URL" --new-window --window-size=1150,820 && exit 0
  fi
done
# No Chrome-style browser: open it in the default browser (Safari etc.).
open "$URL"
