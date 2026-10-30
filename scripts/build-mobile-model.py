"""Build a phone texture variant without changing GLB geometry or originals."""
import argparse
import io
import json
import pathlib
import struct
from PIL import Image

def build(source: pathlib.Path, destination: pathlib.Path):
    data = source.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', data)
    if magic != b'glTF' or version != 2 or length != len(data):
        raise ValueError('Invalid GLB: ' + str(source))
    chunks = {}
    offset = 12
    while offset < length:
        size, kind = struct.unpack_from('<I4s', data, offset)
        chunks[kind] = data[offset + 8:offset + 8 + size]
        offset += 8 + size
    document = json.loads(chunks[b'JSON'])
    binary = chunks.get(b'BIN\0', b'')
    if len(document.get('buffers', [])) != 1 or 'EXT_meshopt_compression' in document.get('extensionsUsed', []):
        raise ValueError('Unsupported mobile GLB buffer layout: ' + str(source))
    image_views = {image['bufferView']: image for image in document.get('images', []) if 'bufferView' in image}
    replacements = {}
    for view_index, image in image_views.items():
        view = document['bufferViews'][view_index]
        raw = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
        with Image.open(io.BytesIO(raw)) as decoded:
            decoded.load()
            # 768px preserves furniture/sign detail at the phone's display size.
            decoded.thumbnail((768, 768), Image.Resampling.LANCZOS)
            has_alpha = 'A' in decoded.getbands() and decoded.getchannel('A').getextrema()[0] < 255
            result = io.BytesIO()
            if has_alpha or image.get('mimeType') == 'image/png':
                decoded.save(result, format='PNG', optimize=True)
                image['mimeType'] = 'image/png'
            else:
                decoded.convert('RGB').save(result, format='JPEG', quality=90, optimize=True)
                image['mimeType'] = 'image/jpeg'
            replacements[view_index] = result.getvalue()
    output = bytearray()
    for index, view in enumerate(document.get('bufferViews', [])):
        if view.get('buffer', 0) != 0:
            raise ValueError('Unexpected GLB buffer')
        original_offset = view.get('byteOffset', 0)
        raw = replacements.get(index, binary[original_offset:original_offset + view['byteLength']])
        output.extend(b'\0' * (-len(output) % 4))
        view['byteOffset'] = len(output)
        view['byteLength'] = len(raw)
        output.extend(raw)
    document['buffers'][0]['byteLength'] = len(output)
    output.extend(b'\0' * (-len(output) % 4))
    encoded = json.dumps(document, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    encoded += b' ' * (-len(encoded) % 4)
    total = 12 + 8 + len(encoded) + 8 + len(output)
    result = struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(encoded), b'JSON') + encoded + struct.pack('<I4s', len(output), b'BIN\0') + output
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(result)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=pathlib.Path)
    parser.add_argument('destination', type=pathlib.Path)
    args = parser.parse_args()
    build(args.source, args.destination)
