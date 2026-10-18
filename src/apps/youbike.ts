import { esc, fmtDist, getJson, getPosition, haversine, navUrl, pollWhileVisible, store, walkMin, type LatLng } from '../util.ts';

interface Station {
  sno: string;
  sna: string;
  sarea: string;
  ar: string;
  act: string;
  updateTime: string;
  Quantity: number;
  available_rent_bikes: number;
  available_return_bikes: number;
  latitude: number;
  longitude: number;
}

type Mode = 'both' | 'rent' | 'return';
const URL_TPE = 'https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json';
const MODES: Array<[Mode, string]> = [
  ['both', '可借也可還'],
  ['rent', '可借'],
  ['return', '可還'],
];

export default function mount(root: HTMLElement): () => void {
  let alive = true;
  let mode = store.get<Mode>('youbike:mode', 'both');
  let pos: LatLng | null = null;
  let stations: Station[] = [];
  let err = '';

  root.innerHTML = `
    <div class="seg" id="seg">${MODES.map(([m, t]) => `<button data-m="${m}">${t}</button>`).join('')}</div>
    <div id="view"><div class="loading">定位與載入站點中…</div></div>`;
  const view = root.querySelector<HTMLElement>('#view')!;
  const seg = root.querySelector<HTMLElement>('#seg')!;

  function paintSeg(): void {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
  }
  seg.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    mode = b.dataset.m as Mode;
    store.set('youbike:mode', mode);
    paintSeg();
    render();
  });
  paintSeg();

  function render(): void {
    if (err && !stations.length) {
      view.innerHTML = `<div class="err">${esc(err)}<br><button class="btn" id="retry" style="margin-top:10px">重試</button></div>`;
      view.querySelector('#retry')!.addEventListener('click', () => void init());
      return;
    }
    if (!pos) return;
    const here = pos;
    const ok = (s: Station) =>
      s.act === '1' &&
      (mode === 'both'
        ? s.available_rent_bikes > 0 && s.available_return_bikes > 0
        : mode === 'rent'
          ? s.available_rent_bikes > 0
          : s.available_return_bikes > 0);
    const withDist = stations.map((s) => ({ s, d: haversine(here, { lat: s.latitude, lng: s.longitude }) }));
    const nearestAny = withDist.reduce((m, x) => Math.min(m, x.d), Infinity);
    const top = withDist
      .filter((x) => ok(x.s))
      .sort((a, b) => a.d - b.d)
      .slice(0, 5);
    const latest = stations.reduce((m, s) => (s.updateTime > m ? s.updateTime : m), '');

    const far =
      nearestAny > 5000
        ? `<div class="banner">離最近的台北 YouBike 站點約 ${fmtDist(nearestAny)}。目前只支援台北市資料，這裡的結果可能沒有參考價值。</div>`
        : '';
    const items = top
      .map(({ s, d }) => {
        const nm = s.sna.replace(/^YouBike2\.0_/, '');
        return `<div class="card list-item">
          <div><div class="name">${esc(nm)}</div>
          <div class="muted small">${esc(s.sarea)}・${esc(s.ar)}</div>
          <div style="margin-top:6px"><span class="pill ${s.available_rent_bikes > 0 ? 'ok' : 'bad'}">🚲 可借 ${s.available_rent_bikes}</span>
          <span class="pill ${s.available_return_bikes > 0 ? 'ok' : 'bad'}">🅿 可還 ${s.available_return_bikes}</span></div></div>
          <div style="text-align:right"><div>${fmtDist(d)}</div><div class="muted small">步行約 ${walkMin(d)} 分</div>
          <a class="navlink" target="_blank" rel="noopener" href="${navUrl({ lat: s.latitude, lng: s.longitude })}">導航 ›</a></div>
        </div>`;
      })
      .join('');
    view.innerHTML = `${far}${items || '<div class="note">附近沒有符合條件的站點</div>'}
      <div class="muted small">資料更新 ${esc(latest.slice(11, 16))}（每分鐘自動更新）　<button class="btn sm" id="again">重新定位</button></div>`;
    view.querySelector('#again')!.addEventListener('click', () => void init());
  }

  async function loadStations(): Promise<void> {
    try {
      stations = await getJson<Station[]>(URL_TPE, 25000);
      err = '';
    } catch (e) {
      if (!stations.length) err = `無法載入站點資料：${String(e)}`;
    }
  }

  async function init(): Promise<void> {
    view.innerHTML = '<div class="loading">定位與載入站點中…</div>';
    const [p] = await Promise.all([getPosition().catch((e: Error) => e), loadStations()]);
    if (!alive) return;
    if (p instanceof Error) {
      view.innerHTML = `<div class="err">${esc(p.message)}<br><button class="btn" id="retry" style="margin-top:10px">重試</button></div>`;
      view.querySelector('#retry')!.addEventListener('click', () => void init());
      return;
    }
    pos = p;
    render();
  }

  void init();
  const stop = pollWhileVisible(async () => {
    if (!pos) return;
    await loadStations();
    if (alive) render();
  }, 60000);

  return () => {
    alive = false;
    stop();
  };
}
