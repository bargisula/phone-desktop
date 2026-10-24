# 我的手機桌面（phone-desktop）

仿 Android 桌面的 PWA：主畫面圖示格＋dock＋搜尋列，點圖示開小 app，左上角返回（系統返回手勢同樣有效）。純前端、無後端。

| App | 說明 | 資料來源 |
| --- | --- | --- |
| 🚦 出門燈 | 帶傘／騎車／跑步三色燈＋一句建議 | Open-Meteo（空氣品質為模型推算，非環境部測站） |
| 🚲 YouBike | 最近「可借也可還」的 5 站（台北市） | 臺北市 YouBike 開放資料 |
| 🅿️ 停車 | 依距離排序、剩餘車位、汽／機／電動車、收藏（台北市） | 臺北市停車管理工程處；靜態清單由 `npm run parking` 產生 |
| ⛅ 天氣 | 定位／查詢地點、12 小時與 7 日預報 | Open-Meteo |
| 🐍 貪食蛇 | 滑動操控、最高分存本機 | — |
| 🏃 跑步紀錄、⚖️ 勞動法規、🍽️ 附近吃什麼、🌀 颱風動態 | 連結（link）到既有 PWA，不改動它們 | — |

## 開發

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 產出 dist/
npm run typecheck
npm run parking    # 重新抓停車場靜態清單（public/data/parking.json）
npm run icons      # 重新產生 PWA 圖示
```

## 新增 app

1. 在 `public/apps.json` 加一筆（`type: "inline"` 或 `"link"`）。
2. inline 的話，在 `src/apps/` 寫一個 `export default function mount(root): () => void`，並在 `src/main.ts` 的 `loaders` 登記。

## 注意

- 只支援台北市的 YouBike 與停車資料；擴到其他縣市需要 TDX 或各市資料，其中多數要金鑰，屆時加 Vercel／Cloudflare Functions 代理。
- 出門燈的判斷門檻集中在 `src/apps/outing.ts` 最上方的 `T`。
- 路由用 hash（`#/a/<id>`），`base` 為相對路徑，可部署在任意子路徑。
