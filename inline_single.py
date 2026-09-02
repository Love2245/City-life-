import os, gc, base64, re, glob as fglob, io

DIST = "dist"
OUT = "dist-portable/index.html"
os.makedirs("dist-portable", exist_ok=True)

# Read source html
with open(os.path.join(DIST, "index.html"), encoding="utf-8") as f:
    html = f.read()
print(f"src html: {len(html)/1024/1024:.1f}MB")
ASSET_ROOT = DIST

def read_text(p):
    with open(os.path.join(ASSET_ROOT, p.lstrip("/")), encoding="utf-8") as fh:
        return fh.read()
def read_bytes(p):
    with open(p, "rb") as fh:
        return fh.read()

# 1) inline module script + stylesheet (small, safe)
html = re.sub(r'<script[^>]*\bsrc="([^"]+)"[^>]*></script>',
              lambda m: '<script type="module">' + read_text(m.group(1)) + '</script>', html)
html = re.sub(r'<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>',
              lambda m: '<style>' + read_text(m.group(1)) + '</style>', html)
gc.collect()

# 2) per-asset replace: built URL -> data URI, keeping glob keys intact
# v1.3b8 内存优化：原先对每个 asset 做两次整串 replace（每次分配一个全新 100MB+ 字符串，
# 90 个 asset 反复分配导致内存碎片 → MemoryError）。改为先构建 {url: dataURI} 映射，
# 再用单遍 re.sub 完成全部替换（只需一次大块分配）。
EXT_MIME = {"svg":"image/svg+xml","gif":"image/gif","woff2":"font/woff2","woff":"font/woff",
        "ttf":"font/ttf","mp3":"audio/mpeg","ogg":"audio/ogg","wav":"audio/wav"}
def detect_mime(data, ext):
    if data[:4]==b'RIFF' and data[8:12]==b'WEBP': return "image/webp"
    if data[:3]==b'\xff\xd8\xff': return "image/jpeg"
    if data[:8]==b'\x89PNG\r\n\x1a\n': return "image/png"
    return EXT_MIME.get(ext, "application/octet-stream")

total = 0
uri_map = {}
files = [p for p in fglob.glob(os.path.join(DIST, "assets", "**", "*"), recursive=True) if os.path.isfile(p)]
for fpath in files:
    name = os.path.relpath(fpath, os.path.join(DIST, "assets")).replace("\\", "/")
    built_url = "/assets/" + name
    if built_url not in html:
        continue
    ext = name.rsplit(".",1)[-1].lower()
    data = read_bytes(fpath)
    b64 = base64.b64encode(data).decode("ascii")
    uri_map[built_url] = f"data:{detect_mime(data, ext)};base64,{b64}"
    total += 1
    del data, b64
gc.collect()

asset_ref = re.compile(r'/assets/[A-Za-z0-9_.()\u4e00-\u9fff-]+')
html = asset_ref.sub(lambda m: uri_map.get(m.group(0), m.group(0)), html)
del uri_map
gc.collect()

# 3) stream-write to disk in chunks to avoid single big f.write peak memory
size = len(html)
print(f"final html in memory: {size/1024/1024:.1f}MB")
CHUNK = 4 * 1024 * 1024  # 4 MB chunks
with open(OUT, "wb") as f:
    # text mode would auto-encode in chunks; encode once is simpler and uses same peak.
    encoded = html.encode("utf-8")
    for i in range(0, len(encoded), CHUNK):
        f.write(encoded[i:i+CHUNK])
del html
del encoded
gc.collect()

# 4) validation（v1.3b8 内存优化：finditer 流式计数 + 抽样解码，不再一次性提取全部 base64 副本）
with open(OUT, encoding="utf-8") as f:
    html = f.read()
non_src_refs = re.findall(r'(?<!src)(?<![A-Za-z/])assets/[A-Za-z0-9_.()/-]+\.[A-Za-z0-9]+', html)
leftover_glob_keys = html.count('/src/assets/')
data_uris = html.count('data:')
img_matches = list(re.finditer(r'data:(image/[a-z+]+);base64,([A-Za-z0-9+/=]+)', html))
all_img_count = len(img_matches)
bad = 0; bad_samples = []
# 抽样验证：前 30 张 + 后 10 张（中间的由正则结构保证格式一致）
sample_idx = set(range(min(30, all_img_count))) | set(range(max(0, all_img_count - 10), all_img_count))
for i in sorted(sample_idx):
    m = img_matches[i]
    mime, u = m.group(1), m.group(2)
    try:
        r = base64.b64decode(u)
        ok = (r[:4]==b'RIFF' and r[8:12]==b'WEBP' and mime=="image/webp") or \
             (r[:3]==b'\xff\xd8\xff' and mime=="image/jpeg") or \
             (r[:8]==b'\x89PNG\r\n\x1a\n' and mime=="image/png")
        if not ok: bad += 1
        if not ok and len(bad_samples)<5: bad_samples.append((mime, len(u), r[:8]))
    except: bad += 1
del img_matches
gc.collect()
print(f"WROTE {OUT} {os.path.getsize(OUT)/1024/1024:.1f}MB assets_inlined={total}")
print(f"non_src_/assets/_leftover= {len(non_src_refs)} | glob_keys_/src/assets/= {leftover_glob_keys} | data_uris={data_uris}")
print(f"image data uris: {all_img_count} (sampled {len(sample_idx)}) | invalid: {bad}")
for s in bad_samples: print("  bad:", s)
