// 由 SVG 產生 PWA 圖示：npm run icons
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const glyph = (pad) => {
  const s = 512 - pad * 2;
  const c = s / 3;
  const colors = ['#22c55e', '#f59e0b', '#2563eb', '#ef4444', '#0ea5e9', '#7c3aed', '#14b8a6', '#ec4899', '#f97316'];
  let dots = '';
  for (let i = 0; i < 9; i++) {
    const cx = pad + (i % 3) * c + c / 2;
    const cy = pad + Math.floor(i / 3) * c + c / 2;
    dots += `<circle cx="${cx}" cy="${cy}" r="${c * 0.34}" fill="${colors[i]}"/>`;
  }
  return dots;
};
const svg = (pad, rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="#0f172a"/>${glyph(pad)}</svg>`;

writeFileSync(new URL('../public/icons/favicon.svg', import.meta.url), svg(96, true));
await sharp(Buffer.from(svg(96, true))).resize(192, 192).png().toFile('public/icons/icon-192.png');
await sharp(Buffer.from(svg(96, true))).resize(512, 512).png().toFile('public/icons/icon-512.png');
// maskable：安全區要在中央 80% 內，圖形留更多邊距，且底色鋪滿
await sharp(Buffer.from(svg(140, false))).resize(512, 512).png().toFile('public/icons/icon-512-maskable.png');
console.log('icons ok');
