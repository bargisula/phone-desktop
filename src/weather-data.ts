import { getJson, type LatLng } from './util.ts';

export interface Forecast {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    uv_index: number | null;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: Array<number | null>;
    weather_code: number[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: Array<number | null>;
    uv_index_max: Array<number | null>;
  };
}

export interface Air {
  current: { time: string; us_aqi: number | null; pm2_5: number | null };
}

export function fetchForecast(p: LatLng): Promise<Forecast> {
  const q = new URLSearchParams({
    latitude: String(p.lat),
    longitude: String(p.lng),
    current:
      'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,uv_index',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max',
    timezone: 'Asia/Taipei',
    forecast_days: '7',
  });
  return getJson<Forecast>(`https://api.open-meteo.com/v1/forecast?${q}`);
}

export function fetchAir(p: LatLng): Promise<Air> {
  const q = new URLSearchParams({
    latitude: String(p.lat),
    longitude: String(p.lng),
    current: 'us_aqi,pm2_5',
    timezone: 'Asia/Taipei',
  });
  return getJson<Air>(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}`);
}

export function wmo(code: number): { icon: string; text: string } {
  if (code === 0) return { icon: '☀️', text: '晴' };
  if (code === 1) return { icon: '🌤️', text: '大致晴朗' };
  if (code === 2) return { icon: '⛅', text: '多雲' };
  if (code === 3) return { icon: '☁️', text: '陰' };
  if (code === 45 || code === 48) return { icon: '🌫️', text: '霧' };
  if (code >= 51 && code <= 57) return { icon: '🌦️', text: '毛毛雨' };
  if (code >= 61 && code <= 67) return { icon: '🌧️', text: '雨' };
  if (code >= 71 && code <= 77) return { icon: '🌨️', text: '雪' };
  if (code >= 80 && code <= 82) return { icon: '🌦️', text: '陣雨' };
  if (code === 85 || code === 86) return { icon: '🌨️', text: '陣雪' };
  if (code >= 95) return { icon: '⛈️', text: '雷雨' };
  return { icon: '🌡️', text: '—' };
}

/** 目前小時起算的索引（hourly.time 為 Asia/Taipei 本地時間字串）。 */
export function currentHourIndex(f: Forecast): number {
  const key = f.current.time.slice(0, 13);
  const i = f.hourly.time.findIndex((t) => t.startsWith(key));
  return i < 0 ? 0 : i;
}
