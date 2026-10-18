import { esc, getPosition, nearestCity, store, timeHM, type LatLng } from '../util.ts';
import { currentHourIndex, fetchAir, fetchForecast, wmo, type Air, type Forecast } from '../weather-data.ts';

/** 判斷門檻集中在這裡，要調整體感只改這個物件。 */
const T = {
  rain: { yellow: 30, red: 60 }, // 未來 3 小時最高降雨機率 %
  wind: { yellow: 25, red: 40 }, // km/h
  aqi: { yellow: 101, red: 151 }, // US AQI（推算值）
  feel: { coldRed: 8, coldYellow: 13, hotYellow: 30, hotRed: 35 }, // 體感 °C
  uv: { yellow: 8, red: 11 },
};

type Level = 'ok' | 'warn' | 'bad';
interface Verdict {
  level: Level;
  reasons: string[];
}
interface Snapshot {
  pos: LatLng;
  f: Forecast;
  air: Air | null;
  at: number;
}

const RANK: Record<Level, number> = { ok: 0, warn: 1, bad: 2 };

function judge(f: Forecast, air: Air | null) {
  const c = f.current;
  const i0 = currentHourIndex(f);
  const pops = f.hourly.precipitation_probability.slice(i0, i0 + 4).filter((x): x is number => x != null);
  const rainP = pops.length ? Math.max(...pops) : 0;
  const raining = c.precipitation > 0 || (c.weather_code >= 51 && c.weather_code <= 67) || (c.weather_code >= 80 && c.weather_code <= 82);
  const thunder = c.weather_code >= 95;
  const aqi = air?.current.us_aqi ?? null;
  const feel = c.apparent_temperature;
  const wind = c.wind_speed_10m;
  const uv = c.uv_index ?? 0;

  const make = (): Verdict => ({ level: 'ok', reasons: [] });
  const bump = (v: Verdict, level: Level, why: string) => {
    if (RANK[level] > RANK[v.level]) v.level = level;
    v.reasons.push(why);
  };

  const umbrella = make();
  if (raining) bump(umbrella, 'bad', '正在下雨');
  else if (rainP >= T.rain.red) bump(umbrella, 'bad', `3 小時內降雨機率 ${rainP}%`);
  else if (rainP >= T.rain.yellow) bump(umbrella, 'warn', `3 小時內降雨機率 ${rainP}%`);

  const ride = make();
  if (thunder) bump(ride, 'bad', '有雷雨');
  if (raining) bump(ride, 'bad', '路面濕滑');
  else if (rainP >= T.rain.red) bump(ride, 'bad', `降雨機率 ${rainP}%`);
  else if (rainP >= T.rain.yellow) bump(ride, 'warn', `降雨機率 ${rainP}%`);
  if (wind >= T.wind.red) bump(ride, 'bad', `風大 ${Math.round(wind)} km/h`);
  else if (wind >= T.wind.yellow) bump(ride, 'warn', `風偏大 ${Math.round(wind)} km/h`);
  if (aqi != null && aqi >= T.aqi.red) bump(ride, 'bad', `空氣差 AQI ${aqi}`);
  else if (aqi != null && aqi >= T.aqi.yellow) bump(ride, 'warn', `空氣普通偏差 AQI ${aqi}`);
  if (feel <= T.feel.coldRed) bump(ride, 'bad', `很冷 體感 ${Math.round(feel)}°`);
  else if (feel <= T.feel.coldYellow) bump(ride, 'warn', `偏冷 體感 ${Math.round(feel)}°`);

  const run = make();
  if (thunder) bump(run, 'bad', '有雷雨');
  if (raining) bump(run, 'warn', '正在下雨');
  else if (rainP >= 50) bump(run, 'warn', `降雨機率 ${rainP}%`);
  if (aqi != null && aqi >= T.aqi.red) bump(run, 'bad', `空氣差 AQI ${aqi}`);
  else if (aqi != null && aqi >= T.aqi.yellow) bump(run, 'warn', `AQI ${aqi}，不宜高強度`);
  if (feel >= T.feel.hotRed) bump(run, 'bad', `太熱 體感 ${Math.round(feel)}°`);
  else if (feel >= T.feel.hotYellow) bump(run, 'warn', `偏熱 體感 ${Math.round(feel)}°`);
  if (feel <= 5) bump(run, 'warn', `很冷 體感 ${Math.round(feel)}°`);
  if (uv >= T.uv.red) bump(run, 'bad', `紫外線極強 ${uv.toFixed(0)}`);
  else if (uv >= T.uv.yellow) bump(run, 'warn', `紫外線強 ${uv.toFixed(0)}`);

  return { umbrella, ride, run, rainP, aqi, feel, wind, uv };
}

function sentence(r: ReturnType<typeof judge>): { level: Level; text: string } {
  const worst = [r.umbrella, r.ride, r.run].reduce<Level>((m, v) => (RANK[v.level] > RANK[m] ? v.level : m), 'ok');
  const parts: string[] = [];
  if (r.umbrella.level !== 'ok') parts.push('帶傘');
  if (r.ride.level === 'bad') parts.push('不建議騎車');
  else if (r.ride.level === 'warn') parts.push('騎車要小心');
  if (r.run.level === 'bad') parts.push('不適合跑步');
  else if (r.run.level === 'warn') parts.push('跑步請降低強度');
  if (worst === 'ok') return { level: 'ok', text: '現在很適合出門，騎車、跑步都沒問題，不用帶傘' };
  return { level: worst, text: `現在出門：${parts.join('、')}` };
}

const LABEL: Record<Level, string> = { ok: '適合', warn: '留意', bad: '不建議' };

export default function mount(root: HTMLElement): () => void {
  let alive = true;
  root.innerHTML = '<div id="view"><div class="loading">定位與取得資料中…</div></div>';
  const view = root.querySelector<HTMLElement>('#view')!;

  function render(s: Snapshot, note = ''): void {
    const r = judge(s.f, s.air);
    const sum = sentence(r);
    const w = wmo(s.f.current.weather_code);
    const lamp = { ok: '😀', warn: '🤔', bad: '☔' }[sum.level];
    const row = (icon: string, name: string, v: Verdict) => `
      <div class="card act">
        <span class="dot ${v.level}"></span>
        <div style="flex:1"><div class="what">${icon} ${name}　<span class="pill ${v.level}">${LABEL[v.level]}</span></div>
        <div class="muted small">${v.reasons.length ? esc(v.reasons.join('、')) : '條件良好'}</div></div>
      </div>`;
    view.innerHTML = `
      ${note}
      <div class="card verdict">
        <div class="lamp ${sum.level}">${lamp}</div>
        <div class="sentence">${esc(sum.text)}</div>
        <div class="muted small" style="margin-top:6px">約在 ${esc(nearestCity(s.pos))}　${w.icon} ${w.text}</div>
      </div>
      ${row('☂️', '帶傘', r.umbrella)}
      ${row('🚲', '騎車', r.ride)}
      ${row('🏃', '跑步', r.run)}
      <div class="card metrics">
        <div><b>${Math.round(s.f.current.apparent_temperature)}°</b><span class="muted small">體感</span></div>
        <div><b>${r.rainP}%</b><span class="muted small">3h 降雨</span></div>
        <div><b>${r.aqi ?? '—'}</b><span class="muted small">AQI（推算）</span></div>
        <div><b>${r.uv.toFixed(0)}</b><span class="muted small">紫外線</span></div>
        <div><b>${Math.round(r.wind)}</b><span class="muted small">風速 km/h</span></div>
        <div><b>${Math.round(s.f.current.relative_humidity_2m)}%</b><span class="muted small">濕度</span></div>
      </div>
      <div class="muted small">資料更新 ${timeHM(new Date(s.at))}（氣象時間 ${esc(s.f.current.time.slice(11))}）。空氣品質為 Open-Meteo 模型推算值，非環境部測站實測。<br>
      <button class="btn sm" id="refresh" style="margin-top:8px">重新整理</button></div>`;
    view.querySelector('#refresh')!.addEventListener('click', () => void run());
  }

  async function run(): Promise<void> {
    let pos: LatLng | null = null;
    let note = '';
    try {
      pos = await getPosition();
    } catch (e) {
      pos = store.get<LatLng | null>('loc:last', null);
      note = `<div class="banner">${esc((e as Error).message)}。${pos ? '改用上次的位置。' : '改用台北市中心。'}</div>`;
      pos ??= { lat: 25.0478, lng: 121.5319 };
    }
    try {
      const [f, air] = await Promise.all([fetchForecast(pos), fetchAir(pos).catch(() => null)]);
      if (!alive) return;
      const snap: Snapshot = { pos, f, air, at: Date.now() };
      store.set('outing:cache', snap);
      render(snap, note);
    } catch (e) {
      if (!alive) return;
      const cache = store.get<Snapshot | null>('outing:cache', null);
      if (cache) render(cache, `<div class="banner">更新失敗（${esc(String(e))}），顯示 ${timeHM(new Date(cache.at))} 的舊資料。</div>`);
      else view.innerHTML = `<div class="err">無法取得資料：${esc(String(e))}<br><button class="btn" id="retry" style="margin-top:10px">重試</button></div>`;
      view.querySelector('#retry')?.addEventListener('click', () => void run());
    }
  }

  const cache = store.get<Snapshot | null>('outing:cache', null);
  if (cache && Date.now() - cache.at < 30 * 60 * 1000) render(cache); // 先秀 30 分內的快取，再背景更新
  void run();

  return () => {
    alive = false;
  };
}
