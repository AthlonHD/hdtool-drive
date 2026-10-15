// 等时圈核心算法:沿多个方位角放射状采样,用高德「距离测量」接口取行驶时间,
// 每条射线取首个超时点之前的位置(线性插值),连成多边形。
const R = 6371008.8;

function destPoint([lng, lat], bearingDeg, distM) {
  const b = (bearingDeg * Math.PI) / 180;
  const d = distM / R;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(b));
  const λ2 = λ1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
  return [(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI];
}

function buildSamples(origin, minutes, bearings, rings, maxKmh) {
  const maxM = (minutes / 60) * maxKmh * 1000;
  const pts = [];
  for (let i = 0; i < bearings; i++) {
    for (let j = 1; j <= rings; j++) {
      pts.push({ bearing: i, ring: j, dist: (maxM * j) / rings, ll: destPoint(origin, (360 * i) / bearings, (maxM * j) / rings) });
    }
  }
  return pts;
}

// durations: 与 samples 同序的行驶秒数(null = 无法到达)
function buildPolygon(samples, durations, limitSec, bearings, rings) {
  const out = [];
  for (let i = 0; i < bearings; i++) {
    let prevDist = 0, prevT = 0, reach = 0;
    for (let j = 1; j <= rings; j++) {
      const k = i * rings + (j - 1);
      const t = durations[k];
      const dist = samples[k].dist;
      if (t == null) { reach = prevDist; break; } // 水面/无路可达,在此截断
      if (t > limitSec) {
        const frac = Math.max(0, Math.min(1, (limitSec - prevT) / (t - prevT)));
        reach = prevDist + (dist - prevDist) * frac;
        break;
      }
      prevDist = dist; prevT = t; reach = dist;
    }
    out.push(reach);
  }
  return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function amapCall(chunk, origin, key) {
  const url = new URL('https://restapi.amap.com/v3/distance');
  url.searchParams.set('key', key);
  url.searchParams.set('type', '1'); // 驾车
  url.searchParams.set('origins', chunk.map(s => s.ll.map(v => v.toFixed(6)).join(',')).join('|'));
  url.searchParams.set('destination', origin.map(v => v.toFixed(6)).join(','));
  for (let attempt = 0; ; attempt++) {
    const r = await (await fetch(url)).json();
    // 10021 / 10014 = 并发或 QPS 超限,稍等重试
    if (r.status !== '1' && ['10021', '10014', '10019', '10020'].includes(String(r.infocode)) && attempt < 3) {
      await sleep(400 * (attempt + 1));
      continue;
    }
    return r;
  }
}

// 某批含非法点(境外/无效坐标)时高德会整批报 20000:对半拆分,把非法点记为不可达,其余照常计算
async function fillChunk(chunk, base, origin, key, durations, state) {
  const r = await amapCall(chunk, origin, key);
  if (r.status === '1') {
    for (const it of r.results || []) {
      const idx = base + Number(it.origin_id) - 1;
      if (it.duration !== undefined && it.duration !== '') durations[idx] = Number(it.duration);
    }
    state.ok += chunk.length;
    return;
  }
  if (String(r.infocode) === '20000') {
    if (chunk.length === 1) { state.bad++; return; }
    const mid = chunk.length >> 1;
    await fillChunk(chunk.slice(0, mid), base, origin, key, durations, state);
    await fillChunk(chunk.slice(mid), base + mid, origin, key, durations, state);
    return;
  }
  throw new Error(`高德接口错误: ${r.info} (${r.infocode})`);
}

async function amapDurations(samples, origin, key) {
  const durations = new Array(samples.length).fill(null);
  const state = { ok: 0, bad: 0 };
  for (let i = 0; i < samples.length; i += 100) {
    await fillChunk(samples.slice(i, i + 100), i, origin, key, durations, state);
  }
  if (state.ok === 0) throw new Error(`高德接口错误: 所有 ${state.bad} 个采样点均被拒绝(INVALID_PARAMS 20000),起点可能在高德不支持的区域(如境外)`);
  return durations;
}

module.exports = { destPoint, buildSamples, buildPolygon, amapDurations };
