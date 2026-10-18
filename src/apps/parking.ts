import { esc, fmtDist, getJson, getPosition, haversine, navUrl, pollWhileVisible, store, type LatLng } from '../util.ts';

interface Lot {
  id: string;
  name: string;
  area: string;
  address: string;
  lat: number;
  lng: number;
  car: number;
  moto: number;
  ev: number;
  pay: string;
}
interface Avail {
  id: string;
  availablecar: number;
  availablemotor: number;
  ChargeStation?: { scoketStatusList?: Array<{ spot_status: string }> };
}
type Mode = 'car' | 'moto' | 'ev';
const MODES: Array<[Mode, string]> = [
  ['car', '🚗 汽車'],
  ['moto', '🛵 機車'],
  ['ev', '🔌 電動車'],
];
const AVAIL_URL = 'https://tcgbusfs.blob.core.windows.net/blobtcmsv/TCMSV_allavailable.json';

export default function mount(root: HTMLElement): () => void {
  let alive = true;
  let mode = store.get<Mode>('parking:mode', 'car');
  let favs = new Set(store.get<string[]>('parking:fav', []));
  let lots: Lot[] = [];
  const avail = new Map<string, Avail>();
  let updated = '';
  let pos: LatLng | null = null;
  let posErr = '';

  root.innerHTML = `
    <div class="seg" id="seg">${MODES.map(([m, t]) => `<button data-m="${m}">${t}</button>`).join('')}</div>
    <div id="view"><div class="loading">載入停車場資料中…</div></div>`;
  const view = root.querySelector<HTMLElement>('#view')!;
  const seg = root.querySelector<HTMLElement>('#seg')!;

  const paintSeg = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
  seg.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    mode = b.dataset.m as Mode;
    store.set('parking:mode', mode);
    paintSeg();
    render();
  });
  paintSeg();

  /** 回傳剩餘格數；null 代表沒有即時資料。 */
  function free(l: Lot): number | null {
    const a = avail.get(l.id);
    if (!a) return null;
    if (mode === 'car') return a.availablecar >= 0 ? a.availablecar : null;
    if (mode === 'moto') return a.availablemotor >= 0 ? a.availablemotor : null;
    const list = a.ChargeStation?.scoketStatusList;
    return list ? list.filter((x) => x.spot_status === '待機中').length : null;
  }
  const total = (l: Lot) => (mode === 'car' ? l.car : mode === 'moto' ? l.moto : l.ev);

  function card(l: Lot, d: number | null): string {
    const f = free(l);
    const t = total(l);
    const cls = f == null ? '' : f === 0 ? 'bad' : f <= Math.max(3, t * 0.1) ? 'warn' : 'ok';
    const star = favs.has(l.id) ? '★' : '☆';
    return `<div class="card list-item">
      <div style="min-width:0"><div class="name">${esc(l.name)}</div>
      <div class="muted small">${esc(l.area)}・${esc(l.address)}</div>
      <div style="margin-top:6px"><span class="pill ${cls}">${f == null ? '無即時資料' : `剩 ${f} 格`}</span>
      ${t && (f == null || t >= f) ? `<span class="muted small"> / 共 ${t}</span>` : ''}</div>
      ${l.pay ? `<div class="muted small" style="margin-top:4px">${esc(l.pay.length > 60 ? l.pay.slice(0, 60) + '…' : l.pay)}</div>` : ''}</div>
      <div style="text-align:right;flex-shrink:0">
        <button class="btn sm" data-fav="${l.id}" aria-label="收藏">${star}</button>
        ${d != null ? `<div style="margin-top:6px">${fmtDist(d)}</div>` : ''}
        <a class="navlink" target="_blank" rel="noopener" href="${navUrl({ lat: l.lat, lng: l.lng }, 'driving')}">導航 ›</a>
      </div></div>`;
  }

  function render(): void {
    if (!lots.length) return;
    const dist = (l: Lot) => (pos ? haversine(pos, l) : null);
    const favList = lots.filter((l) => favs.has(l.id));
    const near = lots
      .filter((l) => total(l) > 0 && !favs.has(l.id))
      .map((l) => ({ l, d: dist(l), f: free(l) }))
      .filter((x) => x.f == null || x.f > 0)
      .sort((a, b) => {
        // 有即時資料的優先，其次距離
        if ((a.f == null) !== (b.f == null)) return a.f == null ? 1 : -1;
        return (a.d ?? 0) - (b.d ?? 0);
      })
      .slice(0, 10);
    const nearest = pos ? Math.min(...lots.map((l) => haversine(pos!, l))) : 0;
    const far =
      pos && nearest > 8000
        ? `<div class="banner">離最近的台北市停車場約 ${fmtDist(nearest)}。目前只支援台北市資料。</div>`
        : '';
    const posNote = !pos
      ? `<div class="banner">${esc(posErr || '尚未取得位置')}，下方不依距離排序。<button class="btn sm" id="relocate" style="margin-left:6px">重新定位</button></div>`
      : '';
    view.innerHTML = `${posNote}${far}
      ${favList.length ? `<div class="muted small" style="margin:4px 0 8px">★ 收藏</div>${favList.map((l) => card(l, dist(l))).join('')}` : ''}
      <div class="muted small" style="margin:4px 0 8px">${pos ? '離我最近（有車位）' : '停車場'}</div>
      ${near.map((x) => card(x.l, x.d)).join('') || '<div class="note">沒有符合條件的停車場</div>'}
      <div class="muted small">即時車位更新 ${esc(updated)}（每分鐘自動更新）。資料：臺北市停車管理工程處。<button class="btn sm" id="relocate2">重新定位</button></div>`;
    view.querySelectorAll<HTMLElement>('[data-fav]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.fav!;
        favs.has(id) ? favs.delete(id) : favs.add(id);
        store.set('parking:fav', [...favs]);
        render();
      }),
    );
    view.querySelector('#relocate')?.addEventListener('click', () => void locate());
    view.querySelector('#relocate2')?.addEventListener('click', () => void locate());
  }

  async function loadAvail(): Promise<void> {
    try {
      const r = await getJson<{ data: { UPDATETIME: string; park: Avail[] } }>(AVAIL_URL, 25000);
      avail.clear();
      r.data.park.forEach((a) => avail.set(a.id, a));
      updated = r.data.UPDATETIME.replace(/^\w+ (\w+) (\d+) (\d+:\d+).*$/, '$1 $2日 $3');
    } catch {
      if (!avail.size) updated = '（無法取得，僅顯示靜態資料）';
    }
  }

  async function locate(): Promise<void> {
    try {
      pos = await getPosition();
      posErr = '';
    } catch (e) {
      pos = null;
      posErr = (e as Error).message;
    }
    if (alive) render();
  }

  (async () => {
    try {
      lots = await getJson<Lot[]>('data/parking.json', 20000);
    } catch (e) {
      view.innerHTML = `<div class="err">無法載入停車場清單：${esc(String(e))}</div>`;
      return;
    }
    await Promise.all([loadAvail(), locate()]);
    if (alive) render();
  })();

  const stop = pollWhileVisible(async () => {
    if (!lots.length) return;
    await loadAvail();
    if (alive) render();
  }, 60000);

  return () => {
    alive = false;
    stop();
    favs = new Set();
  };
}
