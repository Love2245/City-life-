"""Verify v1.48 art and portable publication without loading the HTML into RAM."""
import base64
import hashlib
import json
import mmap
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
version = re.search(r'export const VERSION = "([^"]+)"', (root / 'src/version.ts').read_text(encoding='utf-8')).group(1)
release = root / f'都市生活_v{version}.html'
portable = root / 'dist-portable/index.html'
pack = root / 'src/assets/bg/v1.48'
exhibition_dir = root / 'src/assets/exhibitions/district'
previews_root = root / 'art-previews'

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

release_hash = digest(release)
assert release_hash == digest(portable), 'Published HTML differs from portable output'
atlas_assets = sorted(pack.glob('atlas/*.webp'))
scene_assets = sorted(pack.glob('scenes/*.webp'))
exhibition_assets = sorted(exhibition_dir.glob('*.webp'))
suburb_legacy_assets = sorted((root / 'src/assets/bg/v1.4/suburb').glob('*.webp'))
suburb_weather_assets = sorted((root / 'src/assets/bg/v1.43/atlas/suburb').glob('*.webp'))
assert atlas_assets, 'v1.48 atlas asset pack is empty'
assert scene_assets, 'v1.48 scene asset pack is empty'
expected_exhibits = {
    'museum_neolithic_painted_jar.webp', 'museum_bronze_ritual_ding.webp',
    'museum_han_terracotta_figure.webp', 'museum_tang_bronze_mirror.webp',
    'museum_song_celadon_vase.webp', 'museum_jade_bi_disk.webp',
    'museum_landscape_silk_scroll.webp', 'museum_carved_stele.webp',
    'science_lever_balance.webp', 'science_prism_spectrum.webp',
    'science_water_pressure.webp', 'science_low_voltage_circuit.webp',
    'science_acoustic_resonance.webp', 'science_solar_generator.webp',
    'science_robotic_arm.webp', 'science_orrery.webp',
}
expected_world_paintings = {
    'art_01_mona_lisa.webp', 'art_02_starry_night.webp',
    'art_03_last_supper.webp', 'art_04_the_scream.webp',
    'art_05_pearl_earring.webp', 'art_06_guernica.webp',
    'art_07_birth_venus.webp', 'art_08_creation_adam.webp',
    'art_09_night_watch.webp', 'art_10_persistence_memory.webp',
    'art_11_the_kiss.webp', 'art_12_school_athens.webp',
    'art_13_impression_sunrise.webp', 'art_14_sunflowers.webp',
    'art_15_las_meninas.webp', 'art_16_liberty_leading.webp',
    'art_17_american_gothic.webp', 'art_18_la_grande_jatte.webp',
    'art_19_wanderer_fog.webp', 'art_20_hunters_snow.webp',
}
expected_all_exhibits = expected_exhibits | expected_world_paintings
assert {path.name for path in exhibition_assets} == expected_all_exhibits, (
    f'Expected exactly {len(expected_all_exhibits)} museum, science and art-gallery exhibit images, got: '
    f'{sorted(path.name for path in exhibition_assets)}'
)
assert {path.name for path in suburb_legacy_assets} == {'day.webp', 'dusk.webp', 'night.webp'}, 'Unexpected v1.4 suburb background set'
assert {path.name for path in suburb_weather_assets} == {
    'cloudy-day.webp', 'rain-day.webp', 'sunny-night.webp', 'sunny-late-night.webp',
}, 'Unexpected v1.43 suburb weather background set'
assets = atlas_assets + scene_assets + exhibition_assets + suburb_legacy_assets + suburb_weather_assets
required = ['boyue', 'boyue_night', 'boyue_university', 'boyue_mall', 'boyue_olympic', 'boyue_night_market', 'boyue_night_market_night']
for name in required:
    assert (pack / f'atlas/{name}.webp').is_file(), f'Missing map {name}'
for name in ['airport', 'boyue_engineering_college', 'boyue_swimming_pool', 'boyue_football_field', 'boyue_central_fountain', 'boyue_central_fountain_night']:
    assert (pack / f'scenes/{name}.webp').is_file(), f'Missing scene {name}'
street_groups = {
    'boyue_food_street': sorted((pack / 'scenes').glob('boyue_food_street*.webp')),
    'boyue_snack_street': sorted((pack / 'scenes').glob('boyue_snack_street*.webp')),
}
for name, paths in street_groups.items():
    assert paths, f'Missing district-specific street scene assets for {name}'

verified = []
with release.open('rb') as stream, mmap.mmap(stream.fileno(), 0, access=mmap.ACCESS_READ) as html:
    for path in assets:
        content = path.read_bytes()
        assert content, f'Empty asset: {path}'
        payload = base64.b64encode(content)
        payload_at = html.find(payload)
        assert payload_at >= len(b'data:image/webp;base64,'), f'Artwork is not embedded: {path}'
        prefix_at = payload_at - len(b'data:image/webp;base64,')
        assert html[prefix_at:payload_at] == b'data:image/webp;base64,', f'Artwork is not a resolvable WebP data URL: {path}'
        if path.parent == exhibition_dir:
            category = 'exhibition'
        elif path.parent == root / 'src/assets/bg/v1.4/suburb':
            category = 'suburb-original'
        elif path.parent == root / 'src/assets/bg/v1.43/atlas/suburb':
            category = 'suburb-weather'
        else:
            category = path.parent.name
        verified.append({'path': str(path.relative_to(root)).replace('\\', '/'), 'category': category, 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()})

    # Art previews are source/reference material only. Enumerate nested before/
    # folders; byte-identical copies of a shipped asset are reported as reused,
    # while every other original must be absent from the self-contained page.
    before_dirs = sorted(path for path in previews_root.rglob('before') if path.is_dir()) if previews_root.exists() else []
    before_files = sorted(file for folder in before_dirs for file in folder.rglob('*') if file.is_file())
    packaged_hashes = {hashlib.sha256(path.read_bytes()).hexdigest() for path in assets}
    before_records = []
    for path in before_files:
        content = path.read_bytes()
        asset_hash = hashlib.sha256(content).hexdigest()
        same_as_packaged_asset = asset_hash in packaged_hashes
        if content and not same_as_packaged_asset:
            assert html.find(base64.b64encode(content)) < 0, f'Unused source image was bundled: {path}'
        before_records.append({
            'path': str(path.relative_to(root)).replace('\\', '/'),
            'bytes': len(content),
            'sha256': asset_hash,
            'byteIdenticalToPackagedAsset': same_as_packaged_asset,
        })

report = {'release': str(release), 'bytes': release.stat().st_size, 'sha256': release_hash,
          'portable': str(portable), 'releaseCopiesIdentical': True,
          'verifiedCounts': {'atlas': len(atlas_assets), 'scenes': len(scene_assets),
                             'districtExhibits': len(exhibition_assets),
                             'worldPaintings': len(expected_world_paintings),
                             'suburbOriginalScenes': len(suburb_legacy_assets),
                             'suburbWeatherMaps': len(suburb_weather_assets),
                             'boyueFoodStreet': len(street_groups['boyue_food_street']),
                             'boyueSnackStreet': len(street_groups['boyue_snack_street']),
                             'artPreviewsBeforeFilesChecked': len(before_files),
                             'artPreviewsBeforeExcluded': sum(not row['byteIdenticalToPackagedAsset'] for row in before_records),
                             'artPreviewsBeforeReusedExactCopies': sum(row['byteIdenticalToPackagedAsset'] for row in before_records)},
          'artPreviewsBefore': before_records,
          'verifiedArt': verified}
output = root / 'artifacts/v1.48/final-release-verification.json'
output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'bytes': report['bytes'], 'sha256': release_hash, 'releaseCopiesIdentical': True, 'embeddedAssets': len(verified), 'report': str(output)}, ensure_ascii=False))
