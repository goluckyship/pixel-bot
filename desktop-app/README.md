# Pixel Bot.exe (Windows app)

A tiny program that opens https://pixelbotstudio.net in its own app window (Chrome, Edge or Brave),
with the Pixel Bot robot icon. Nothing to install: download it, drag it to the desktop, double-click.

Build (from any OS with Go):

    python3 make-icon.py ../src/dashboard/public/icon-512.png rsrc_windows_amd64.syso
    GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H=windowsgui" -o "Pixel Bot.exe" .

Copy the result to `src/dashboard/public/PixelBot.exe`; the website serves it at /download/windows.
