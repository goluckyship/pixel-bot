# Builds "Pixel Bot.app" (zipped) for Mac: a tiny app that opens pixelbotstudio.net in its own window.
import io, sys, zipfile, os
from PIL import Image
here = os.path.dirname(os.path.abspath(__file__))
icon_png, out = sys.argv[1], sys.argv[2]
plist = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Pixel Bot</string>
<key>CFBundleDisplayName</key><string>Pixel Bot</string>
<key>CFBundleIdentifier</key><string>net.pixelbotstudio.app</string>
<key>CFBundleVersion</key><string>1.0</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleExecutable</key><string>PixelBot</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>LSMinimumSystemVersion</key><string>10.13</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
"""
img = Image.open(icon_png).convert('RGBA').resize((1024, 1024), Image.NEAREST)
icns = io.BytesIO(); img.save(icns, format='ICNS', sizes=[(16,16),(32,32),(64,64),(128,128),(256,256),(512,512),(1024,1024)])
script = open(os.path.join(here, 'PixelBot.sh'), 'rb').read()
root = 'Pixel Bot.app/Contents/'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    def add(name, data, mode):
        info = zipfile.ZipInfo(name, date_time=(2026, 10, 14, 0, 0, 0))
        info.create_system = 3  # Unix, so the permissions below are kept
        info.external_attr = (mode & 0xFFFF) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, data)
    for d in ['Pixel Bot.app/', root, root + 'MacOS/', root + 'Resources/']:
        add(d, b'', 0o040755)
    add(root + 'Info.plist', plist.encode(), 0o100644)
    add(root + 'PkgInfo', b'APPL????', 0o100644)
    add(root + 'MacOS/PixelBot', script, 0o100755)
    add(root + 'Resources/AppIcon.icns', icns.getvalue(), 0o100644)
print('built', out, os.path.getsize(out), 'bytes')
