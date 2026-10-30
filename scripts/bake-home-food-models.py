"""Bake six CC0 Food Kit palette meshes into synchronous, offline-safe geometry.

Geometry and authored normals are retained. The source palette is sampled once
per triangle, so neither external texture URLs nor asynchronous prop swapping
are needed in a furnished room. Run from the project root with Pillow installed.
"""
import hashlib
import json
import struct
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs/home-objects-20261015/kenney-food-kit/Models/GLB format'
NAMES = ['utensil-fork', 'utensil-knife', 'utensil-spoon', 'cutting-board', 'cooking-knife', 'bottle-oil']
atlas = Image.open(SOURCE / 'Textures/colormap.png').convert('RGB')
out = {}
for name in NAMES:
    path = SOURCE / f'{name}.glb'
    raw = path.read_bytes()
    json_length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + json_length])
    binary_offset = 20 + json_length + 8
    def accessor(index):
        a = doc['accessors'][index]
        v = doc['bufferViews'][a['bufferView']]
        fmt = {5121: 'B', 5123: 'H', 5125: 'I', 5126: 'f'}[a['componentType']]
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        stride = v.get('byteStride', struct.calcsize('<' + fmt * width))
        offset = binary_offset + v.get('byteOffset', 0) + a.get('byteOffset', 0)
        return [struct.unpack_from('<' + fmt * width, raw, offset + i * stride) for i in range(a['count'])]
    parts = {}
    for primitive in doc['meshes'][0]['primitives']:
        attributes = primitive['attributes']
        positions = accessor(attributes['POSITION'])
        normals = accessor(attributes['NORMAL'])
        uvs = accessor(attributes['TEXCOORD_0'])
        indices = [i[0] for i in accessor(primitive['indices'])]
        for t in range(0, len(indices), 3):
            triangle = indices[t:t + 3]
            u = sum(uvs[i][0] for i in triangle) / 3
            v = sum(uvs[i][1] for i in triangle) / 3
            # glTF textures use a top-left UV origin (GLTFLoader sets flipY=false).
            rgb = atlas.getpixel((min(atlas.width - 1, max(0, int(u * atlas.width))), min(atlas.height - 1, max(0, int(v * atlas.height)))))
            color = '#%02x%02x%02x' % rgb
            part = parts.setdefault(color, {'color': color, 'positions': [], 'normals': []})
            for i in triangle:
                part['positions'].extend(round(x, 6) for x in positions[i])
                part['normals'].extend(round(x, 6) for x in normals[i])
    all_positions = [p for part in parts.values() for p in zip(*[iter(part['positions'])] * 3)]
    low = [min(p[i] for p in all_positions) for i in range(3)]
    high = [max(p[i] for p in all_positions) for i in range(3)]
    out[name] = {'sourceSha256': hashlib.sha256(raw).hexdigest(), 'min': low, 'max': high, 'parts': list(parts.values())}
target = ROOT / 'src/assets/home/v1.49/models/food-props.json'
target.write_text(json.dumps(out, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'{target}: {target.stat().st_size} bytes')
for name, item in out.items():
    print(name, 'size', [round(hi - lo, 4) for lo, hi in zip(item['min'], item['max'])], 'colors', len(item['parts']))
