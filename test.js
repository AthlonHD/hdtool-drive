// 离线自测:假设处处 80km/h 直线行驶,2 小时应得到约 160km 半径的圆
const assert = require('assert');
const { buildSamples, buildPolygon } = require('./api/_lib');
const origin = [120, 30], B = 36, R = 16, min = 120;
const samples = buildSamples(origin, min, B, R, 110);
const dur = samples.map(s => (s.dist / 1000 / 80) * 3600);
const reach = buildPolygon(samples, dur, min * 60, B, R);
reach.forEach(d => assert(Math.abs(d / 1000 - 160) < 1, d));
// 某方向第 5 圈起不可达(水面)→ 在该处截断
const d2 = dur.map((t, k) => (k % R >= 4 && Math.floor(k / R) === 0 ? null : t));
assert(Math.abs(buildPolygon(samples, d2, min * 60, B, R)[0] - samples[3].dist) < 1);
console.log('ok');
