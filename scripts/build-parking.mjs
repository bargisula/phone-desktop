// 抓臺北市停車場靜態資料（名稱、地址、座標、總格數），瘦身後存成 public/data/parking.json。
// 即時剩餘車位由前端執行時另抓。停車場新增或異動時重跑：npm run parking
import { writeFileSync } from 'node:fs';

const SRC = 'https://tcgbusfs.blob.core.windows.net/blobtcmsv/TCMSV_alldesc.json';
const res = await fetch(SRC);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const json = await res.json();

// TWD97 / TM2 (中央經線 121°) → WGS84
function tm2ToWgs84(x, y) {
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const b = a * (1 - f);
  const e2 = 1 - (b * b) / (a * a);
  const k0 = 0.9999;
  const lon0 = (121 * Math.PI) / 180;
  const dx = 250000;
  x -= dx;
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const J1 = (3 * e1) / 2 - (27 * e1 ** 3) / 32;
  const J2 = (21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32;
  const J3 = (151 * e1 ** 3) / 96;
  const J4 = (1097 * e1 ** 4) / 512;
  const fp = mu + J1 * Math.sin(2 * mu) + J2 * Math.sin(4 * mu) + J3 * Math.sin(6 * mu) + J4 * Math.sin(8 * mu);
  const ep2 = e2 / (1 - e2);
  const C1 = ep2 * Math.cos(fp) ** 2;
  const T1 = Math.tan(fp) ** 2;
  const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(fp) ** 2) ** 1.5;
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(fp) ** 2);
  const D = x / (N1 * k0);
  const lat =
    fp -
    ((N1 * Math.tan(fp)) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lon =
    lon0 +
    (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) /
      Math.cos(fp);
  return { lat: (lat * 180) / Math.PI, lng: (lon * 180) / Math.PI };
}

const out = [];
let skipped = 0;
for (const p of json.data.park) {
  let lat;
  let lng;
  const x = parseFloat(p.tw97x);
  const y = parseFloat(p.tw97y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    ({ lat, lng } = tm2ToWgs84(x, y));
  } else {
    const e = p.EntranceCoord?.EntrancecoordInfo?.[0];
    if (e) {
      lat = parseFloat(e.Xcod);
      lng = parseFloat(e.Ycod);
    }
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 24 || lat > 26 || lng < 120 || lng > 122.5) {
    skipped++;
    continue;
  }
  const evMatch = /充電格位:(\d+)格/.exec(p.summary ?? '');
  out.push({
    id: p.id,
    name: p.name,
    area: p.area,
    address: p.address,
    lat: +lat.toFixed(6),
    lng: +lng.toFixed(6),
    car: p.totalcar ?? 0,
    moto: p.totalmotor ?? 0,
    ev: evMatch ? Number(evMatch[1]) : 0,
    pay: (p.payex ?? '').replace(/\s+/g, ' ').slice(0, 80),
  });
}
writeFileSync(new URL('../public/data/parking.json', import.meta.url), JSON.stringify(out));
console.log(`寫入 ${out.length} 筆，略過 ${skipped} 筆（無有效座標）`);
