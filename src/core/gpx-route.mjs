const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;
export const MAX_WAYPOINTS = 16;

export function distanceMeters(a, b) {
  const p = PI / 180; const dLat = (b.lat - a.lat) * p; const dLon = (b.lon - a.lon) * p;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, x)));
}

export function dedupePoints(points, minMeters = 1) {
  const out = [points[0]];
  for (const point of points.slice(1)) if (distanceMeters(out[out.length - 1], point) >= minMeters) out.push(point);
  return out;
}

export function parseGpx(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('GPX XML 解析失败');
  const elements = [...xml.getElementsByTagNameNS('*', 'trkpt')];
  if (!elements.length) throw new Error('GPX 中没有找到轨迹点（trkpt）');
  const points = elements.map((el) => ({ lat: Number(el.getAttribute('lat')), lon: Number(el.getAttribute('lon')) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (points.length < 2) throw new Error('GPX 至少需要两个有效轨迹点');
  return dedupePoints(points);
}

function project(point, origin) {
  const p = PI / 180;
  return { x: (point.lon - origin.lon) * p * 6371000 * Math.cos(origin.lat * p), y: (point.lat - origin.lat) * p * 6371000 };
}
function pointLineDistance(point, start, end, origin) {
  const p = project(point, origin); const a = project(start, origin); const b = project(end, origin);
  const dx = b.x - a.x; const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function rdp(points, epsilon, start = 0, end = points.length - 1, kept = new Set([0, points.length - 1])) {
  if (end <= start + 1) return kept;
  let max = epsilon; let index = -1;
  for (let i = start + 1; i < end; i += 1) {
    const error = pointLineDistance(points[i], points[start], points[end], points[start]);
    if (error > max) { max = error; index = i; }
  }
  if (index >= 0) { kept.add(index); rdp(points, epsilon, start, index, kept); rdp(points, epsilon, index, end, kept); }
  return kept;
}
function turnScore(points, index) {
  if (index <= 0 || index >= points.length - 1) return 0;
  const a = points[index - 1]; const b = points[index]; const c = points[index + 1]; const p = PI / 180;
  const ax = (a.lon - b.lon) * Math.cos(b.lat * p); const ay = a.lat - b.lat; const cx = (c.lon - b.lon) * Math.cos(b.lat * p); const cy = c.lat - b.lat;
  const denominator = Math.hypot(ax, ay) * Math.hypot(cx, cy); if (!denominator) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (ax * cx + ay * cy) / denominator))) * distanceMeters(a, c);
}

export function selectWaypoints(points, limit = MAX_WAYPOINTS) {
  if (points.length <= limit + 2) return points.slice(1, -1);
  let low = 1; let high = 10000; let best = new Set([0, points.length - 1]);
  for (let i = 0; i < 24; i += 1) {
    const epsilon = (low + high) / 2; const candidate = rdp(points, epsilon);
    if (candidate.size - 2 <= limit) { best = candidate; high = epsilon; } else low = epsilon;
  }
  const extras = points.map((point, index) => ({ index, score: turnScore(points, index) }))
    .filter((x) => x.index > 0 && x.index < points.length - 1 && !best.has(x.index)).sort((a, b) => b.score - a.score);
  for (const extra of extras) { if (best.size - 2 >= limit) break; best.add(extra.index); }
  return [...best].sort((a, b) => a - b).slice(1, -1).map((index) => points[index]);
}

export function wgs84ToGcj02(point) {
  const { lat, lon } = point; if (lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271) return { ...point };
  const x = lon - 105; const y = lat - 35;
  let dLat = -100 + 2 * x + 3 * y + .2 * y * y + .1 * x * y + .2 * Math.sqrt(Math.abs(x));
  dLat += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3 + (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3 + (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y / 30 * PI)) * 2 / 3;
  let dLon = 300 + x + 2 * y + .1 * x * x + .1 * x * y + .1 * Math.sqrt(Math.abs(x));
  dLon += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3 + (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3 + (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
  const rad = lat / 180 * PI; const magic = 1 - EE * Math.sin(rad) ** 2; const sqrt = Math.sqrt(magic);
  return { lat: lat + dLat * 180 / ((A * (1 - EE) / (magic * sqrt)) * PI), lon: lon + dLon * 180 / (A / sqrt * Math.cos(rad) * PI) };
}

export function buildAmapUrl(points, { alreadyGcj02 = false, mode = 3 } = {}) {
  const converted = alreadyGcj02 ? points : points.map(wgs84ToGcj02); const start = converted[0]; const end = converted.at(-1); const via = selectWaypoints(converted);
  const params = new URLSearchParams({ vname: via.map((_, i) => `途经点${i + 1}`).join('|'), vlat: via.map((p) => p.lat.toFixed(6)).join('|'), vlon: via.map((p) => p.lon.toFixed(6)).join('|'), fname: 'GPX起点', flat: start.lat.toFixed(6), flon: start.lon.toFixed(6), dname: 'GPX终点', dlat: end.lat.toFixed(6), dlon: end.lon.toFixed(6), type: String(mode) });
  return `https://www.amap.com/ssr/dir?${params.toString()}`;
}
export function describeRoute(points) {
  const distance = points.slice(1).reduce((sum, point, i) => sum + distanceMeters(points[i], point), 0);
  return { trackPoints: points.length, distanceKm: distance / 1000, waypointCount: selectWaypoints(points).length };
}
