"""Download and validate the public Fairfax DTM; no tokens, paid APIs or invented heights.

Run with the bundled Python (Pillow + numpy). Produces a reproducible 5 m preview,
not a survey. The original GeoTIFF and service responses remain beside the grid.
"""
import hashlib
import io
import json
import math
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import urlopen

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / 'public/datasets/frying-pan-farm'
SERVICE = 'https://www.fairfaxcounty.gov/gisimagery/rest/services/LiDAR/2022_LiDAR_Digital_Terrain_Model/ImageServer'
BBOX = [-77.4145, 38.9318, -77.3993, 38.9432]
WIDTH, HEIGHT = 257, 249
# Source metadata uses Foot_US; preserve NAVD88/GEOID18, do not claim ellipsoid heights.
FOOT_TO_M = 1200 / 3937


def fetch(url):
    if urlparse(url).scheme != 'https' or urlparse(url).hostname != 'www.fairfaxcounty.gov':
        raise ValueError('Only the known public Fairfax HTTPS service is allowed')
    with urlopen(url, timeout=60) as response:
        data = response.read(25 * 1024 * 1024 + 1)
    if len(data) > 25 * 1024 * 1024:
        raise ValueError('Download exceeds 25 MiB')
    return data


def request(endpoint, params=None):
    url = SERVICE + endpoint + '?' + urlencode({'f': 'json', **(params or {})})
    value = json.loads(fetch(url))
    if 'error' in value:
        raise ValueError(value['error'])
    return value, url


def main():
    info, _ = request('/1/info')
    assert info['pixelType'] == 'F32' and info['bandCount'] == 1
    assert info['extent']['spatialReference']['latestWkid'] == 6593
    metadata_xml = fetch(SERVICE + '/1/info/metadata').decode('utf-8')
    assert 'Foot_US' in metadata_xml and 'GEOID18' in metadata_xml and 'NAVD88' in metadata_xml
    export, export_url = request('/exportImage', {
        'bbox': ','.join(map(str, BBOX)), 'bboxSR': 4326, 'imageSR': 4326,
        'size': f'{WIDTH},{HEIGHT}', 'adjustAspectRatio': 'false', 'format': 'tiff',
        'pixelType': 'F32', 'noData': '-999999', 'interpolation': 'RSP_BilinearInterpolation',
        'renderingRule': json.dumps({'rasterFunction': 'None'}),
        'mosaicRule': json.dumps({'mosaicMethod': 'esriMosaicLockRaster', 'lockRasterIds': [1]}),
    })
    extent = export['extent']
    assert [extent[k] for k in ['xmin', 'ymin', 'xmax', 'ymax']] == BBOX
    assert extent['spatialReference'].get('latestWkid', extent['spatialReference']['wkid']) == 4326
    raw = fetch(export['href'])
    raster = Image.open(io.BytesIO(raw))
    assert raster.mode == 'F' and raster.size == (WIDTH, HEIGHT)
    values = np.asarray(raster, dtype=float)
    assert np.isfinite(values).all() and (values > 0).all() and (values < 1000).all(), 'NoData/invalid values: do not fill or invent elevations'
    # Verify GeoTIFF pixel-edge georeference independently of the export response.
    scale, tie = raster.tag_v2[33550], raster.tag_v2[33922]
    assert abs(tie[3] - BBOX[0]) < 1e-9 and abs(tie[4] - BBOX[3]) < 1e-9
    assert abs(scale[0] * WIDTH - (BBOX[2] - BBOX[0])) < 1e-9
    assert abs(scale[1] * HEIGHT - (BBOX[3] - BBOX[1])) < 1e-9
    # Compare 5 pixel centers against full-resolution server samples, not the exported grid.
    checks = []
    for col, row in [(128, 124), (32, 32), (220, 32), (32, 215), (220, 215)]:
        lon = BBOX[0] + (col + .5) * scale[0]
        lat = BBOX[3] - (row + .5) * scale[1]
        sample, _ = request('/getSamples', {
            'geometry': json.dumps({'x': lon, 'y': lat, 'spatialReference': {'wkid': 4326}}),
            'geometryType': 'esriGeometryPoint', 'returnFirstValueOnly': 'true',
            'interpolation': 'RSP_BilinearInterpolation',
        })
        source_feet = float(sample['samples'][0]['value'])
        error_m = abs(source_feet - values[row, col]) * FOOT_TO_M
        checks.append({'longitude': lon, 'latitude': lat, 'source_ft': source_feet, 'grid_ft': float(values[row, col]), 'difference_m': error_m})
    assert max(check['difference_m'] for check in checks) < 1.5, 'Unexpected raster resampling/registration difference'
    meters = np.round(values * FOOT_TO_M, 3)
    # Values are pixel CENTERS, not corners. Runtime must honor this half-pixel offset.
    grid = {'version': 1, 'crs': 'EPSG:4326', 'vertical_datum': 'NAVD88 / GEOID18', 'unit': 'm',
            'bbox': BBOX, 'width': WIDTH, 'height': HEIGHT, 'registration': 'pixel-center',
            'values': meters.ravel().tolist()}
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'dtm-2022-5m.tif').write_bytes(raw)
    (ROOT / 'terrain-2022-5m.json').write_text(json.dumps(grid, separators=(',', ':')), encoding='utf-8')
    evidence = {'export_url': export_url, 'export': export, 'source_raster_info': info,
                'geotiff_tags': {str(k): list(raster.tag_v2[k]) for k in [33550, 33922, 34735]},
                'source_unit': 'Foot_US', 'factor_to_m': FOOT_TO_M, 'checks': checks,
                'minimum_m': float(meters.min()), 'maximum_m': float(meters.max()), 'nodata_count': 0,
                'width_m': (BBOX[2] - BBOX[0]) * math.pi / 180 * 6378137 * math.cos(38.9375 * math.pi / 180),
                'height_m': (BBOX[3] - BBOX[1]) * math.pi / 180 * 6378137,
                'tiff_sha256': hashlib.sha256(raw).hexdigest(),
                'grid_sha256': hashlib.sha256((ROOT / 'terrain-2022-5m.json').read_bytes()).hexdigest()}
    (ROOT / 'elevation-validation.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
    (ROOT / 'source-elevation-metadata.xml').write_text(metadata_xml, encoding='utf-8')
    print(json.dumps({k: evidence[k] for k in ['minimum_m', 'maximum_m', 'nodata_count', 'checks', 'grid_sha256']}))


if __name__ == '__main__':
    main()
