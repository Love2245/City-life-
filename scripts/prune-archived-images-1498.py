"""Remove only audited, unreferenced image copies with identical recovery files in 1.497."""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROOF = ROOT / 'docs/gallery-forum-1498-20261031'
ARCHIVE = (ROOT / '待清理文件/1.498-未调用素材-20261030').resolve()
RECOVERY = (ROOT.parent / '都市生活1.497').resolve()
IMAGE_SUFFIXES = {'.png', '.webp', '.jpg', '.jpeg', '.gif', '.avif'}
TEXT_SUFFIXES = {'.ts', '.js', '.mjs', '.svelte', '.json', '.html', '.css', '.svg', '.py'}
manifest = json.loads((ROOT / 'docs/performance-1498-20261030/unused-assets-archive.json').read_text(encoding='utf8'))
used = set(json.loads((ROOT / 'docs/performance-1498-20261030/asset-usage-before.json').read_text(encoding='utf8'))['sources'])
source = '\n'.join(p.read_text(encoding='utf8', errors='ignore').replace('\\', '/')
                   for folder in ['src', 'scripts', 'tests', 'previews']
                   for p in (ROOT / folder).rglob('*') if p.is_file() and p.suffix in TEXT_SUFFIXES)
rows, skipped = [], []
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for row in manifest['files']:
    rel = row['path']
    if Path(rel).suffix.lower() not in IMAGE_SUFFIXES:
        skipped.append({'path': rel, 'reason': 'Not an image'}); continue
    target, recovery = (ARCHIVE / rel).resolve(), (RECOVERY / rel).resolve()
    assert target.is_relative_to(ARCHIVE) and recovery.is_relative_to(RECOVERY)
    assert ARCHIVE.is_relative_to(ROOT.resolve()) and RECOVERY != ROOT.resolve()
    if not target.exists():
        skipped.append({'path': rel, 'reason': 'Already absent'}); continue
    generic = target.stem in {'day', 'dusk', 'night', 'default', 'normal', 'idle', 'attack', 'hit'}
    if rel in used or rel.removeprefix('src/') in source or (not generic and target.name in source):
        skipped.append({'path': rel, 'reason': 'Live source/tool/test or dependency graph reference'}); continue
    assert not (ROOT / rel).exists(), rel
    assert target.is_file() and target.stat().st_size == row['bytes'] and sha(target) == row['sha256'], target
    assert recovery.is_file() and recovery.stat().st_size == row['bytes'] and sha(recovery) == row['sha256'], recovery
    rows.append(row)
report = {'applied': '--apply' in sys.argv, 'archive': str(ARCHIVE), 'recoveryRoot': str(RECOVERY),
          'rule': 'Images only; absent from runtime graph and live source/tools/tests; identical SHA-256 recovery file in read-only 1.497; delete only this exact archived copy.',
          'deletedCount': len(rows), 'deletedBytes': sum(r['bytes'] for r in rows), 'files': rows, 'skipped': skipped}
if report['applied']:
    for row in rows:
        target = (ARCHIVE / row['path']).resolve()
        assert target.is_relative_to(ARCHIVE) and sha(target) == row['sha256']
        target.unlink()
    for directory in sorted((p for p in ARCHIVE.rglob('*') if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
        if not any(directory.iterdir()): directory.rmdir()
    (PROOF / 'image-prune-applied.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
else:
    (PROOF / 'image-prune-plan.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps({k: report[k] for k in ['applied', 'deletedCount', 'deletedBytes']}, ensure_ascii=False))
