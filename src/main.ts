import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { esc, h } from './util.ts';

registerSW({ immediate: true });

interface AppDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: 'inline' | 'link';
  url?: string;
  dock: boolean;
  keywords?: string;
}

type Mount = (root: HTMLElement) => void | (() => void);

/** 內嵌 app：動態載入，主畫面不用先下載每個 app 的程式碼。 */
const loaders: Record<string, () => Promise<{ default: Mount }>> = {
  snake: () => import('./apps/snake.ts'),
  weather: () => import('./apps/weather.ts'),
  outing: () => import('./apps/outing.ts'),
  youbike: () => import('./apps/youbike.ts'),
  parking: () => import('./apps/parking.ts'),
};

const root = document.getElementById('app')!;
let apps: AppDef[] = [];
let cleanup: (() => void) | void;
let clockTimer: number | undefined;

function tile(a: AppDef, dock = false): string {
  // dock 也要顯示名稱，否則只看圖示不知道是什麼
  const inner = `<span class="icon" style="background:${a.color}">${a.icon}</span><span class="label${dock ? ' in-dock' : ''}">${esc(a.name)}</span>`;
  return a.type === 'link'
    ? `<a class="tile" data-id="${a.id}" href="${esc(a.url ?? '#')}" target="_blank" rel="noopener">${inner}</a>`
    : `<a class="tile" data-id="${a.id}" href="#/a/${a.id}">${inner}</a>`;
}

function renderHome(): void {
  cleanup?.();
  cleanup = undefined;
  const dockApps = apps.filter((a) => a.dock);
  const gridApps = apps.filter((a) => !a.dock);
  root.className = 'home';
  root.innerHTML = `
    <section class="clock"><div class="time" id="clk-time"></div><div class="date" id="clk-date"></div></section>
    <section class="grid" id="grid">${gridApps.map((a) => tile(a)).join('')}</section>
    <section class="dock" id="dock">${dockApps.map((a) => tile(a, true)).join('')}</section>
    <section class="search"><input id="q" type="search" placeholder="搜尋 app" autocomplete="off" enterkeyhint="search" /></section>
    <div class="empty" id="empty" hidden>找不到符合的 app</div>`;

  const tick = () => {
    const now = new Date();
    document.getElementById('clk-time')!.textContent = now.toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    document.getElementById('clk-date')!.textContent = now.toLocaleDateString('zh-TW', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  };
  tick();
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = window.setInterval(tick, 10000);

  const q = document.getElementById('q') as HTMLInputElement;
  q.addEventListener('input', () => {
    const kw = q.value.trim().toLowerCase();
    let shown = 0;
    root.querySelectorAll<HTMLElement>('.tile').forEach((el) => {
      const a = apps.find((x) => x.id === el.dataset.id)!;
      const hit = !kw || `${a.name} ${a.keywords ?? ''} ${a.id}`.toLowerCase().includes(kw);
      el.classList.toggle('dim', !hit);
      if (hit) shown++;
    });
    document.getElementById('empty')!.hidden = shown > 0;
  });
}

async function renderApp(id: string): Promise<void> {
  const def = apps.find((a) => a.id === id);
  const loader = loaders[id];
  if (!def || !loader) {
    location.hash = '';
    return;
  }
  cleanup?.();
  cleanup = undefined;
  if (clockTimer) clearInterval(clockTimer);
  root.className = 'appview';
  root.innerHTML = '';
  const bar = h('header', { class: 'appbar' }, `<button class="back" aria-label="返回">‹</button><span class="title">${def.icon} ${esc(def.name)}</span>`);
  const body = h('main', { class: 'appbody' }, '<div class="loading">載入中…</div>');
  root.append(bar, body);
  bar.querySelector('.back')!.addEventListener('click', () => {
    // 從主畫面點進來時 history 有上一頁，用 back 保持系統返回與按鈕一致
    if (history.length > 1 && sessionStorage.getItem('pd:fromHome') === '1') history.back();
    else location.hash = '';
  });
  try {
    const mod = await loader();
    if (!root.contains(body)) return;
    body.innerHTML = '';
    cleanup = mod.default(body);
  } catch (e) {
    body.innerHTML = `<div class="err">載入失敗：${esc(String(e))}</div>`;
  }
}

function route(): void {
  const m = location.hash.match(/^#\/a\/([\w-]+)/);
  if (m) {
    void renderApp(m[1]!);
  } else {
    renderHome();
  }
}

window.addEventListener('hashchange', () => {
  sessionStorage.setItem('pd:fromHome', location.hash.startsWith('#/a/') ? '1' : '0');
  route();
});

// 主畫面 → app 的導覽才算「從主畫面進入」；直接開 #/a/xxx 時返回鍵改為清除 hash
sessionStorage.setItem('pd:fromHome', '0');

fetch('apps.json')
  .then((r) => r.json())
  .then((list: AppDef[]) => {
    apps = list;
    route();
  })
  .catch(() => {
    root.innerHTML = '<div class="err">無法載入 apps.json</div>';
  });
