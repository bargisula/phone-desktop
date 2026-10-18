export interface LatLng {
  lat: number;
  lng: number;
}

export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* 無痕模式或空間滿，忽略 */
    }
  },
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string> = {},
  html = '',
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) el.setAttribute(k, v);
  if (html) el.innerHTML = html;
  return el;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export async function getJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

export function walkMin(m: number): number {
  return Math.max(1, Math.round(m / 75));
}

export function navUrl(p: LatLng, mode: 'walking' | 'driving' = 'walking'): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=${mode}`;
}

/** 取得目前位置；失敗時丟出帶中文訊息的 Error。 */
export function getPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('這個瀏覽器不支援定位'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        store.set('loc:last', p);
        resolve(p);
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? '定位權限被拒絕，請到瀏覽器網站設定允許定位後再試'
            : '無法取得位置，請確認 GPS 已開啟';
        reject(new Error(msg));
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
    );
  });
}

export function lastPosition(): LatLng | null {
  return store.get<LatLng | null>('loc:last', null);
}

const CITIES: Array<[string, number, number]> = [
  ['台北市', 25.0375, 121.5637],
  ['新北市', 25.0121, 121.4657],
  ['基隆市', 25.1276, 121.7392],
  ['桃園市', 24.9937, 121.3010],
  ['新竹市', 24.8138, 120.9675],
  ['新竹縣', 24.8387, 121.0178],
  ['苗栗縣', 24.5602, 120.8214],
  ['台中市', 24.1477, 120.6736],
  ['彰化縣', 24.0518, 120.5161],
  ['南投縣', 23.9609, 120.9719],
  ['雲林縣', 23.7092, 120.4313],
  ['嘉義市', 23.4801, 120.4491],
  ['嘉義縣', 23.4518, 120.2555],
  ['台南市', 22.9998, 120.2269],
  ['高雄市', 22.6273, 120.3014],
  ['屏東縣', 22.5519, 120.5487],
  ['宜蘭縣', 24.7021, 121.7378],
  ['花蓮縣', 23.9872, 121.6015],
  ['台東縣', 22.7583, 121.1444],
  ['澎湖縣', 23.5711, 119.5793],
  ['金門縣', 24.4493, 118.3767],
  ['連江縣', 26.1505, 119.9499],
];

/** 以內建縣市中心點找最近的縣市名稱（粗略，僅供顯示用）。 */
export function nearestCity(p: LatLng): string {
  let best = CITIES[0]!;
  let bestD = Infinity;
  for (const c of CITIES) {
    const d = haversine(p, { lat: c[1], lng: c[2] });
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return bestD > 60000 ? '台灣以外或離島' : best[0];
}

/** 簡單的 visibilitychange 輪詢：頁面可見才執行，回到前景立即補一次。 */
export function pollWhileVisible(fn: () => void, intervalMs: number): () => void {
  let timer: number | undefined;
  const start = () => {
    stop();
    timer = window.setInterval(fn, intervalMs);
  };
  const stop = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };
  const onVis = () => {
    if (document.hidden) stop();
    else {
      fn();
      start();
    }
  };
  document.addEventListener('visibilitychange', onVis);
  start();
  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVis);
  };
}

export function timeHM(d = new Date()): string {
  return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
}
