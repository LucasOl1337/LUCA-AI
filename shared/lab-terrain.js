import { toLocalCoordinate } from './lab-telemetry.js';

export function parseLabTerrain(data, reference) {
  if (!data || data.version !== 1 || data.crs !== 'EPSG:4326' || data.unit !== 'm'
    || data.registration !== 'pixel-center' || typeof data.vertical_datum !== 'string' || !data.vertical_datum.trim()) throw new Error('Relevo: formato, unidade ou datum incompatível.');
  const { width, height, bbox, values } = data;
  if (![width, height].every(n => Number.isInteger(n) && n >= 2 && n <= 512)
    || !Array.isArray(values) || values.length !== width * height) throw new Error('Relevo: dimensões inválidas (máximo 512 × 512).');
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)
    || bbox[0] >= bbox[2] || bbox[1] >= bbox[3] || bbox[0] < -180 || bbox[2] > 180 || bbox[1] <= -90 || bbox[3] >= 90
    || JSON.stringify(bbox) !== JSON.stringify(reference.bbox)) throw new Error('Relevo: bbox difere do manifesto.');
  if (data.vertical_datum !== reference.vertical_datum) throw new Error('Relevo: datum vertical difere do manifesto.');
  let minimum = Infinity, maximum = -Infinity;
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < -12000 || value > 9000) throw new Error('Relevo com NoData ou altura inválida: superfície plana mantida, sem preencher lacunas.');
    minimum = Math.min(minimum, value); maximum = Math.max(maximum, value);
  }
  return { ...data, minimum, maximum };
}

// Bilinear at pixel centers. Only the outer half pixel is extended to its edge.
// Outside the raster is unknown, never an invented zero elevation.
export function createTerrainSampler(grid, origin) {
  const nw = toLocalCoordinate(grid.bbox[0], grid.bbox[3], origin);
  const se = toLocalCoordinate(grid.bbox[2], grid.bbox[1], origin);
  return (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z) || x < nw.x - 1e-7 || x > se.x + 1e-7 || z < nw.z - 1e-7 || z > se.z + 1e-7) return null;
    const u = Math.max(0, Math.min(grid.width - 1, (x - nw.x) / (se.x - nw.x) * grid.width - .5));
    const v = Math.max(0, Math.min(grid.height - 1, (z - nw.z) / (se.z - nw.z) * grid.height - .5));
    const col = Math.min(Math.floor(u), grid.width - 2), row = Math.min(Math.floor(v), grid.height - 2);
    const dx = u - col, dz = v - row, i = row * grid.width + col;
    return (grid.values[i] * (1 - dx) + grid.values[i + 1] * dx) * (1 - dz)
      + (grid.values[i + grid.width] * (1 - dx) + grid.values[i + grid.width + 1] * dx) * dz;
  };
}
