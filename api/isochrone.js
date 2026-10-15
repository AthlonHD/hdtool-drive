const { buildSamples, buildPolygon, amapDurations, destPoint } = require('./_lib');

const BEARINGS = 36, RINGS = 16;
// 乐观上限时速:用来决定每条射线最远采多远(高速 ≈ 110km/h),采样圈数固定,约 3 次高德调用/次查询
const MAX_KMH = 110;

module.exports = async (req, res) => {
  try {
    const key = process.env.AMAP_WEB_KEY;
    if (!key) return res.status(500).json({ error: '服务端未配置 AMAP_WEB_KEY' });
    const lng = Number(req.query.lng), lat = Number(req.query.lat);
    const minutes = Number(req.query.minutes);
    if (![lng, lat, minutes].every(Number.isFinite) || minutes < 5 || minutes > 720)
      return res.status(400).json({ error: '参数错误: lng, lat, minutes(5-720)' });
    const origin = [lng, lat];
    const samples = buildSamples(origin, minutes, BEARINGS, RINGS, MAX_KMH);
    const durations = await amapDurations(samples, origin, key);
    const reach = buildPolygon(samples, durations, minutes * 60, BEARINGS, RINGS);
    const ring = reach.map((d, i) => destPoint(origin, (360 * i) / BEARINGS, d));
    ring.push(ring[0]);
    res.setHeader('Cache-Control', 's-maxage=3600');
    res.json({ origin, minutes, polygon: ring, reachKm: reach.map(d => +(d / 1000).toFixed(1)) });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
