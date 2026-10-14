# Builds a COFF .syso with the app icon (RT_ICON + RT_GROUP_ICON) and version info for Go's linker.
import struct, io, sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
base = Image.open(src).convert('RGBA')
sizes = [16, 24, 32, 48, 64, 128, 256]
pngs = []
for s in sizes:
    b = io.BytesIO(); base.resize((s, s), Image.NEAREST).save(b, 'PNG'); pngs.append(b.getvalue())

def u16(v): return struct.pack('<H', v)
def u32(v): return struct.pack('<I', v)

# version info (VS_VERSIONINFO) so Explorer shows "Pixel Bot"
def vs_string(key, val):
    k = (key + '\0').encode('utf-16le'); v = (val + '\0').encode('utf-16le')
    hdr = 6 + len(k); pad = (4 - hdr % 4) % 4
    body = k + b'\0' * pad + v
    return u16(6 + len(body)) + u16(len(val) + 1) + u16(1) + body
def block(key, children, value=b'', vtype=1):
    k = (key + '\0').encode('utf-16le'); hdr = 6 + len(k); pad = (4 - hdr % 4) % 4
    data = k + b'\0' * pad + value
    if value: data += b'\0' * ((4 - len(data) % 4) % 4)
    for c in children:
        data += c + b'\0' * ((4 - len(c) % 4) % 4)
    vlen = len(value) if vtype == 0 else len(value) // 2
    return u16(6 + len(data)) + u16(vlen) + u16(vtype) + data
strings = [vs_string(k, v) for k, v in [('CompanyName', 'Pixel Bot Studio'), ('FileDescription', 'Pixel Bot'), ('FileVersion', '1.0.0.0'), ('ProductName', 'Pixel Bot'), ('ProductVersion', '1.0.0.0'), ('OriginalFilename', 'Pixel Bot.exe')]]
stfi = block('StringFileInfo', [block('040904B0', strings)])
var = block('VarFileInfo', [block('Translation', [], u16(0x0409) + u16(0x04B0), vtype=0)])
ffi = u32(0xFEEF04BD) + u32(0x00010000) + u32(0x00010000) + u32(0) + u32(0x00010000) + u32(0) + u32(0x3F) + u32(0) + u32(0x40004) + u32(1) + u32(0) + u32(0) + u32(0)
version = block('VS_VERSION_INFO', [stfi, var], ffi, vtype=0)

group = u16(0) + u16(1) + u16(len(sizes))
for i, (s, p) in enumerate(zip(sizes, pngs)):
    w = 0 if s >= 256 else s
    group += bytes([w, w, 0, 0]) + u16(1) + u16(32) + u32(len(p)) + u16(i + 1)

# resource tree: type -> id -> lang -> data
tree = {3: {i + 1: p for i, p in enumerate(pngs)}, 14: {1: group}, 16: {1: version}}
types = sorted(tree)
def dir_hdr(n): return u32(0) + u32(0) + u16(0) + u16(0) + u16(0) + u16(n)
# compute layout
off = 16 + 8 * len(types)
type_dir_off = {}
for t in types: type_dir_off[t] = off; off += 16 + 8 * len(tree[t])
lang_dir_off = {}
for t in types:
    for i in sorted(tree[t]): lang_dir_off[(t, i)] = off; off += 16 + 8
data_entry_off = {}
for t in types:
    for i in sorted(tree[t]): data_entry_off[(t, i)] = off; off += 16
data_off = {}
for t in types:
    for i in sorted(tree[t]):
        off = (off + 7) & ~7; data_off[(t, i)] = off; off += len(tree[t][i])
total = (off + 7) & ~7
buf = bytearray(total); relocs = []
def put(o, b): buf[o:o + len(b)] = b
put(0, dir_hdr(len(types)) + b''.join(u32(t) + u32(0x80000000 | type_dir_off[t]) for t in types))
for t in types:
    ids = sorted(tree[t])
    put(type_dir_off[t], dir_hdr(len(ids)) + b''.join(u32(i) + u32(0x80000000 | lang_dir_off[(t, i)]) for i in ids))
    for i in ids:
        put(lang_dir_off[(t, i)], dir_hdr(1) + u32(0x0409) + u32(data_entry_off[(t, i)]))
        put(data_entry_off[(t, i)], u32(data_off[(t, i)]) + u32(len(tree[t][i])) + u32(0) + u32(0))
        relocs.append(data_entry_off[(t, i)])
        put(data_off[(t, i)], tree[t][i])

raw_ptr = 20 + 40
reloc_ptr = raw_ptr + total
sym_ptr = reloc_ptr + 10 * len(relocs)
coff = u16(0x8664) + u16(1) + u32(0) + u32(sym_ptr) + u32(1) + u16(0) + u16(0)
sect = b'.rsrc\0\0\0' + u32(0) + u32(0) + u32(total) + u32(raw_ptr) + u32(reloc_ptr) + u32(0) + u16(len(relocs)) + u16(0) + u32(0x40000040)
rel = b''.join(u32(r) + u32(0) + u16(3) for r in relocs)  # IMAGE_REL_AMD64_ADDR32NB
sym = b'.rsrc\0\0\0' + u32(0) + struct.pack('<h', 1) + u16(0) + bytes([3, 0])
open(out, 'wb').write(coff + sect + bytes(buf) + rel + sym + u32(4))
print('syso', len(coff + sect + buf + rel + sym) + 4, 'bytes,', len(relocs), 'resources')
