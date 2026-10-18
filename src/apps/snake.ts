import { store } from '../util.ts';

const N = 18; // 固定格數，畫面依螢幕寬度縮放
type Dir = 'up' | 'down' | 'left' | 'right';
const VEC: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export default function mount(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="snake-wrap">
      <div class="snake-hud"><span>分數 <b id="sc">0</b></span><span class="muted">最高 <b id="best">0</b></span></div>
      <div class="snake-board"><canvas id="cv"></canvas><div class="snake-overlay" id="ov"></div></div>
      <div class="snake-ctl">
        <button class="btn" id="pause">暫停</button>
        <button class="btn primary" id="restart">重新開始</button>
      </div>
      <div class="muted small">在遊戲區滑動轉向；切到背景會自動暫停</div>
    </div>`;

  const cv = root.querySelector<HTMLCanvasElement>('#cv')!;
  const ov = root.querySelector<HTMLElement>('#ov')!;
  const scEl = root.querySelector<HTMLElement>('#sc')!;
  const bestEl = root.querySelector<HTMLElement>('#best')!;
  const pauseBtn = root.querySelector<HTMLButtonElement>('#pause')!;
  const ctx = cv.getContext('2d')!;

  const size = Math.floor(Math.min(root.clientWidth - 2, window.innerHeight - 260, 420) / N) * N;
  const cell = size / N;
  const dpr = window.devicePixelRatio || 1;
  cv.width = size * dpr;
  cv.height = size * dpr;
  cv.style.width = `${size}px`;
  cv.style.height = `${size}px`;
  ctx.scale(dpr, dpr);

  let best = store.get<number>('snake:best', 0);
  bestEl.textContent = String(best);

  type State = 'ready' | 'running' | 'paused' | 'over';
  let state: State = 'ready';
  let snake: Array<[number, number]> = [];
  let dir: Dir = 'right';
  let queue: Dir[] = [];
  let food: [number, number] = [0, 0];
  let score = 0;
  let timer: number | undefined;

  function placeFood(): void {
    for (;;) {
      const f: [number, number] = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)];
      if (!snake.some((s) => s[0] === f[0] && s[1] === f[1])) {
        food = f;
        return;
      }
    }
  }

  function reset(): void {
    const m = Math.floor(N / 2);
    snake = [
      [m, m],
      [m - 1, m],
      [m - 2, m],
    ];
    dir = 'right';
    queue = [];
    score = 0;
    scEl.textContent = '0';
    placeFood();
    draw();
  }

  function speed(): number {
    return Math.max(60, 150 - score * 4);
  }

  function schedule(): void {
    clearTimeout(timer);
    if (state === 'running') timer = window.setTimeout(step, speed());
  }

  function step(): void {
    if (state !== 'running') return;
    // 每個 tick 只消耗一次轉向，並拒絕與「最後排定方向」相反，避免一個間隔內連按造成原地掉頭
    const next = queue.shift();
    if (next && next !== OPP[dir]) dir = next;
    const [dx, dy] = VEC[dir];
    const head: [number, number] = [snake[0]![0] + dx, snake[0]![1] + dy];
    const eating = head[0] === food[0] && head[1] === food[1];
    const body = eating ? snake : snake.slice(0, -1);
    const hit =
      head[0] < 0 || head[1] < 0 || head[0] >= N || head[1] >= N || body.some((s) => s[0] === head[0] && s[1] === head[1]);
    if (hit) {
      gameOver();
      return;
    }
    snake.unshift(head);
    if (eating) {
      score++;
      scEl.textContent = String(score);
      placeFood();
    } else {
      snake.pop();
    }
    draw();
    schedule();
  }

  function gameOver(): void {
    state = 'over';
    if (score > best) {
      best = score;
      store.set('snake:best', best);
      bestEl.textContent = String(best);
    }
    showOverlay(`遊戲結束<br>分數 ${score}${score >= best && score > 0 ? '（新紀錄！）' : ''}<br><span class="muted">按「重新開始」再玩一次</span>`);
    pauseBtn.textContent = '暫停';
  }

  function showOverlay(html: string | null): void {
    ov.style.display = html ? 'grid' : 'none';
    if (html) ov.innerHTML = html;
  }

  function draw(): void {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(food[0] * cell + 2, food[1] * cell + 2, cell - 4, cell - 4);
    snake.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? '#86efac' : '#22c55e';
      ctx.fillRect(s[0] * cell + 1, s[1] * cell + 1, cell - 2, cell - 2);
    });
  }

  function start(): void {
    reset();
    state = 'running';
    showOverlay(null);
    pauseBtn.textContent = '暫停';
    schedule();
  }

  function pause(): void {
    if (state === 'running') {
      state = 'paused';
      clearTimeout(timer);
      showOverlay('已暫停');
      pauseBtn.textContent = '繼續';
    }
  }

  function resume(): void {
    if (state === 'paused') {
      state = 'running';
      showOverlay(null);
      pauseBtn.textContent = '暫停';
      schedule();
    }
  }

  function turn(d: Dir): void {
    if (state === 'ready' || state === 'over') {
      if (state === 'ready') start();
      else return;
    }
    const last = queue.length ? queue[queue.length - 1]! : dir;
    if (d === last || d === OPP[last]) return;
    if (queue.length < 2) queue.push(d);
  }

  // ── 滑動操控：移動超過門檻就轉向，並以當下位置重設起點，連續滑動手感較順
  let tx = 0;
  let ty = 0;
  const TH = 18;
  const board = root.querySelector<HTMLElement>('.snake-board')!;
  board.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0]!;
      tx = t.clientX;
      ty = t.clientY;
      if (state === 'ready') start();
      e.preventDefault();
    },
    { passive: false },
  );
  board.addEventListener(
    'touchmove',
    (e) => {
      const t = e.touches[0]!;
      const dx = t.clientX - tx;
      const dy = t.clientY - ty;
      if (Math.abs(dx) >= TH || Math.abs(dy) >= TH) {
        turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
        tx = t.clientX;
        ty = t.clientY;
      }
      e.preventDefault();
    },
    { passive: false },
  );

  const onKey = (e: KeyboardEvent) => {
    const map: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    const d = map[e.key];
    if (d) {
      turn(d);
      e.preventDefault();
    } else if (e.key === ' ') {
      state === 'paused' ? resume() : pause();
      e.preventDefault();
    }
  };
  document.addEventListener('keydown', onKey);

  const onVis = () => {
    if (document.hidden) pause();
  };
  document.addEventListener('visibilitychange', onVis);

  pauseBtn.addEventListener('click', () => (state === 'paused' ? resume() : pause()));
  root.querySelector('#restart')!.addEventListener('click', start);

  reset();
  showOverlay('滑動遊戲區開始<br><span class="muted">吃紅點，別撞牆或自己</span>');

  return () => {
    clearTimeout(timer);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
  };
}
