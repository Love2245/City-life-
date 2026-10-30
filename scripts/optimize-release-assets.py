"""Build cache only: retain formal sources; optimize emitted images and embedded GLB textures."""
import concurrent.futures, hashlib, io, json, math, struct, time, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(sys.argv[sys.argv.index('--cache')+1]) if '--cache' in sys.argv else ROOT / '.cache/release-assets'
CACHE.mkdir(parents=True, exist_ok=True)
jobs = sys.argv[sys.argv.index('--jobs')+1] if '--jobs' in sys.argv else None
USAGE = json.loads(Path(jobs).read_text(encoding='utf-8')) if jobs else json.loads((ROOT / 'dist-portable/asset-usage.json').read_text(encoding='utf-8'))
OUT = ROOT / 'docs/performance-1498-20261030'
if not jobs:OUT.mkdir(parents=True,exist_ok=True)

def encode_image(data, filename, originals):
    image = Image.open(io.BytesIO(data))
    if getattr(image, 'n_frames', 1) != 1:
        return None
    before = image.size
    still = any('mobile-stills/' in s.replace('\\', '/') for s in originals)
    depth = still and filename.lower().endswith('.png')
    if image.mode == 'P' and 'transparency' in image.info:
        image = image.convert('RGBA')
    if still:
        limit = 1280
    else:
        # UI maps and atlases retain their layout/detail; shrink only large scene pictures.
        limit = 2048
    factor = min(1, limit / max(image.size))
    if factor < 1:
        image = image.resize(tuple(max(1, round(n * factor)) for n in image.size), Image.Resampling.NEAREST if depth else Image.Resampling.LANCZOS)
    stream = io.BytesIO()
    if depth:
        # R/G encode 16-bit depth. A native Gray16 PNG would lose precision in canvas.
        image.save(stream, format='PNG', optimize=True)
        ext = '.png'
    else:
        alpha = image.mode in ('RGBA', 'LA') and image.getextrema()[-1][0] < 255
        image = image.convert('RGBA' if alpha else 'RGB')
        pixel = any('/cats/' in s.replace('\\', '/') or '/cat-cards/' in s.replace('\\', '/') for s in originals)
        image.save(stream, format='WEBP', quality=88 if not still else 84, lossless=alpha or pixel, method=4)
        ext = '.webp'
    result = stream.getvalue()
    if len(result) >= len(data) * .96:
        return None
    return result, ext, {'before': list(before), 'after': list(image.size), 'depthRGPreserved': depth, 'lossless': depth or alpha or pixel if not depth else True}

def optimize_glb(data):
    if data[:4] != b'glTF':
        return None
    size, typ = struct.unpack_from('<II', data, 12)
    if typ != 0x4E4F534A:
        return None
    doc = json.loads(data[20:20+size])
    # Do not rewrite compressed/accessor extensions without an extension-aware encoder.
    if set(doc.get('extensionsUsed', [])) & {'EXT_meshopt_compression','KHR_draco_mesh_compression','EXT_texture_webp','KHR_texture_basisu'} or len(doc.get('buffers', [])) != 1:
        return None
    off = 20 + size
    bin_size, bin_type = struct.unpack_from('<II', data, off)
    if bin_type != 0x004E4942:
        return None
    binary = data[off+8:off+8+bin_size]
    replacements = {}
    decoded_before = decoded_after = 0
    for item in doc.get('images', []):
        if 'bufferView' not in item:
            continue
        index = item['bufferView']
        view = doc['bufferViews'][index]
        if view.get('buffer', 0) != 0:
            return None
        raw = binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]
        try:
            image = Image.open(io.BytesIO(raw))
            w, h = image.size
            decoded_before += w*h*4
            factor = min(1, 1024/max(w, h))
            if factor < 1:
                image = image.resize((max(1, round(w*factor)), max(1, round(h*factor))), Image.Resampling.LANCZOS)
                stream = io.BytesIO()
                if item.get('mimeType') == 'image/jpeg':
                    image.convert('RGB').save(stream, format='JPEG', quality=88, optimize=True)
                else:
                    image.save(stream, format='PNG', optimize=True)
                replacements[index] = stream.getvalue()
            decoded_after += image.width*image.height*4
        except Exception:
            return None
    if not replacements:
        return None
    payload = bytearray()
    for i, view in enumerate(doc.get('bufferViews', [])):
        if view.get('buffer', 0) != 0:
            return None
        while len(payload) % 4:
            payload.append(0)
        part = replacements.get(i, binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']])
        view['byteOffset'], view['byteLength'] = len(payload), len(part)
        payload.extend(part)
    doc['buffers'][0]['byteLength'] = len(payload)
    while len(payload) % 4:
        payload.append(0)
    js = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode()
    js += b' ' * (-len(js) % 4)
    result = b'glTF' + struct.pack('<II', 2, 12+8+len(js)+8+len(payload)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(payload), 0x004E4942) + payload
    if len(result) >= len(data) * .96:
        return None
    return result, '.glb', {'embeddedDecodedBytesBefore': decoded_before, 'embeddedDecodedBytesAfter': decoded_after, 'textureLimit': 1024, 'geometryPreserved': True}

def process(asset):
    p = Path(asset['inputFile']) if asset.get('inputFile') else ROOT / 'dist-portable' / asset['file']
    if p.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp', '.glb') or not p.exists():
        return None
    data = p.read_bytes()
    if len(data) < 12_000:
        return None
    digest = hashlib.sha256(data).hexdigest()
    try:
        result = optimize_glb(data) if p.suffix.lower() == '.glb' else encode_image(data, p.name, asset.get('originals', []))
        if not result:
            return None
        optimized, ext, detail = result
        name = digest + ext
        (CACHE / name).write_bytes(optimized)
        return {'sourceHash': digest, 'originalFile': asset['file'], 'originals': asset.get('originals', []), 'bytesBefore': len(data), 'bytesAfter': len(optimized), 'file': name, 'sha256': hashlib.sha256(optimized).hexdigest(), 'extension': ext, **detail}
    except Exception as e:
        raise RuntimeError(f'{asset["file"]}: {e}') from e

started = time.time()
glb_only = '--glb-only' in sys.argv
previous=json.loads((CACHE/'manifest.json').read_text(encoding='utf8')) if (CACHE/'manifest.json').exists() else {'entries':[],'checkedHashes':[]}
rows = previous['entries'] if glb_only or jobs else []
if glb_only:
    rows=[r for r in rows if r['extension']!='.glb']
assets=[a for a in USAGE['assets'] if a['file'].endswith('.glb')] if glb_only else USAGE['assets']
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for index, row in enumerate(pool.map(process, assets)):
        if row:
            rows.append(row)
        if index % 200 == 0:
            print(f'{index}/{len(USAGE["assets"])} assets, {len(rows)} optimized', flush=True)
checked=set(previous.get('checkedHashes',[]))
for asset in assets:
    p=Path(asset['inputFile']) if asset.get('inputFile') else ROOT/'dist-portable'/asset['file']
    if p.exists():checked.add(hashlib.sha256(p.read_bytes()).hexdigest())
manifest = {'version': 1, 'createdAt': time.time(), 'entries': list({r['sourceHash']:r for r in rows}.values()),'checkedHashes':sorted(checked)}
(CACHE / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
summary = {'count': len(rows), 'before': sum(r['bytesBefore'] for r in rows), 'after': sum(r['bytesAfter'] for r in rows), 'seconds': time.time()-started, 'glbDecodedBefore': sum(r.get('embeddedDecodedBytesBefore', 0) for r in rows), 'glbDecodedAfter': sum(r.get('embeddedDecodedBytesAfter', 0) for r in rows)}
(CACHE/'summary.json' if jobs else OUT/'asset-optimization.json').write_text(json.dumps({'summary': summary, 'entries': rows}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(summary), flush=True)
