import { esc, getJson, getPosition, store, timeHM, type LatLng } from '../util.ts';
import { currentHourIndex, fetchForecast, wmo, type Forecast } from '../weather-data.ts';

interface Place extends LatLng {
  name: string;
  gps?: boolean;
}
interface Cache {
  place: Place;
  data: Forecast;
  at: number;
}

const WD = ['日', '一', '二', '三', '四', '五', '六'];
const DEFAULT_PLACE: Place = { name: '台北', lat: 25.0478, lng: 121.5319 };

export default function mount(root: HTMLElement): () => void {
  let alive = true;
  root.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <input class="text" id="q" type="search" placeholder="查詢其他地點（例：高雄、Tokyo）" enterkeyhint="search" />
      <button class="btn" id="gps" title="目前位置">📍</button>
    </div>
    <div id="results"></div>
    <div id="view"><div class="loading">載入中…</div></div>`;

  const view = root.querySelector<HTMLElement>('#view')!;
  const results = root.querySelector<HTMLElement>('#results')!;
  const q = root.querySelector<HTMLInputElement>('#q')!;

  function render(place: Place, f: Forecast, stale = false): void {
    const c = f.current;
    const w = wmo(c.weather_code);
    const i0 = currentHourIndex(f);
    const hours = f.hourly.time
      .slice(i0, i0 + 12)
      .map((t, k) => {
        const idx = i0 + k;
        const pop = f.hourly.precipitation_probability[idx];
        return `<div class="h"><div class="muted">${t.slice(11, 13)}時</div><div>${wmo(f.hourly.weather_code[idx]!).icon}</div><div>${Math.round(f.hourly.temperature_2m[idx]!)}°</div><div class="muted">${pop == null ? '' : pop + '%'}</div></div>`;
      })
      .join('');
    const days = f.daily.time
      .map((d, k) => {
        const dt = new Date(d + 'T00:00:00');
        const label = k === 0 ? '今天' : `週${WD[dt.getDay()]}`;
        const pop = f.daily.precipitation_probability_max[k];
        return `<div class="day"><span>${label}</span><span>${wmo(f.daily.weather_code[k]!).icon}</span><span class="muted">${pop == null ? '' : '降雨 ' + pop + '%'}</span><span>${Math.round(f.daily.temperature_2m_min[k]!)}° / ${Math.round(f.daily.temperature_2m_max[k]!)}°</span></div>`;
      })
      .join('');
    view.innerHTML = `
      <div class="card now">
        <div class="muted">${place.gps ? '📍 ' : ''}${esc(place.name)}</div>
        <div class="big">${Math.round(c.temperature_2m)}°</div>
        <div>${w.icon} ${w.text}　體感 ${Math.round(c.apparent_temperature)}°</div>
        <div class="muted small" style="margin-top:6px">濕度 ${Math.round(c.relative_humidity_2m)}%　風速 ${Math.round(c.wind_speed_10m)} km/h${c.uv_index != null ? '　紫外線 ' + c.uv_index.toFixed(0) : ''}</div>
      </div>
      <div class="card"><div class="muted small" style="margin-bottom:8px">未來 12 小時</div><div class="hours">${hours}</div></div>
      <div class="card"><div class="muted small" style="margin-bottom:4px">7 日預報</div>${days}</div>
      <div class="muted small">資料：Open-Meteo　${stale ? '⚠️ 離線／更新失敗，顯示上次資料 ' : '更新 '}${timeHM(new Date(f.current.time))}</div>`;
  }

  async function load(place: Place): Promise<void> {
    store.set('weather:place', place);
    const cache = store.get<Cache | null>('weather:cache', null);
    if (cache && cache.place.name === place.name) render(cache.place, cache.data, false);
    else view.innerHTML = '<div class="loading">載入中…</div>';
    try {
      const data = await fetchForecast(place);
      if (!alive) return;
      store.set('weather:cache', { place, data, at: Date.now() } satisfies Cache);
      render(place, data);
    } catch (e) {
      if (!alive) return;
      if (cache && cache.place.name === place.name) render(cache.place, cache.data, true);
      else view.innerHTML = `<div class="err">無法取得天氣：${esc(String(e))}</div>`;
    }
  }

  async function useGps(): Promise<void> {
    view.innerHTML = '<div class="loading">定位中…</div>';
    try {
      const p = await getPosition();
      await load({ ...p, name: '目前位置', gps: true });
    } catch (e) {
      const fallback = store.get<Place | null>('weather:place', null) ?? DEFAULT_PLACE;
      await load(fallback);
      const banner = document.createElement('div');
      banner.className = 'banner';
      banner.textContent = `${(e as Error).message}，改顯示「${fallback.name}」。`;
      view.prepend(banner);
    }
  }

  root.querySelector('#gps')!.addEventListener('click', () => void useGps());
  q.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !q.value.trim()) return;
    results.innerHTML = '<div class="note small">搜尋中…</div>';
    try {
      const r = await getJson<{ results?: Array<{ name: string; admin1?: string; country?: string; latitude: number; longitude: number }> }>(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.value.trim())}&count=6&language=zh&format=json`,
      );
      const list = r.results ?? [];
      if (!list.length) {
        results.innerHTML = '<div class="note small">找不到這個地點</div>';
        return;
      }
      results.innerHTML = `<div class="card">${list
        .map(
          (x, i) =>
            `<div class="list-item" style="padding:6px 0"><span>${esc(x.name)} <span class="muted small">${esc([x.admin1, x.country].filter(Boolean).join('，'))}</span></span><button class="btn sm" data-i="${i}">選擇</button></div>`,
        )
        .join('')}</div>`;
      results.querySelectorAll<HTMLButtonElement>('button[data-i]').forEach((b) =>
        b.addEventListener('click', () => {
          const x = list[Number(b.dataset.i)]!;
          results.innerHTML = '';
          q.value = '';
          void load({ name: x.name, lat: x.latitude, lng: x.longitude });
        }),
      );
    } catch (err) {
      results.innerHTML = `<div class="err">搜尋失敗：${esc(String(err))}</div>`;
    }
  });

  // 起始：上次的地點；若沒有則嘗試定位，失敗退回台北
  const saved = store.get<Place | null>('weather:place', null);
  if (saved) void load(saved);
  else void useGps();

  return () => {
    alive = false;
  };
}
