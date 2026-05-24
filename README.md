# TS Clipper

預覽、剪輯 MPEG-TS 並輸出 MP4 的 Windows 桌面工具。

- Electron + React + TypeScript + Tailwind
- 影片預覽：mpv（內嵌子視窗，--wid + named pipe IPC），含音量／靜音控制
- 截圖：擷取目前畫面為 PNG / JPEG，原始解析度、無 OSD
- 轉檔：ffmpeg.exe（支援 stream copy 與重新編碼，自動偵測 NVENC / QSV / AMF）

## 一次性設定

```powershell
# 1. 安裝相依套件
npm install

# 2. 取得 ffmpeg / ffprobe（自動）+ mpv（手動）
npm run fetch-binaries
```

`fetch-binaries` 會：

- 自動下載 BtbN 的 FFmpeg Windows build，把 `ffmpeg.exe`、`ffprobe.exe` 放到 `resources/bin/`
- 自動下載 shinchiro 的 mpv x86_64 build（.7z），透過 npm 內含的 `7zip-bin` 解壓 `mpv.exe`

預期最終結構：

```
resources/bin/
├── ffmpeg.exe
├── ffprobe.exe
└── mpv.exe
```

## 開發

```powershell
npm run dev
```

會同時跑：

1. `vite` 開發伺服器（port 5173）
2. `tsc --watch` 編譯 `electron/` → `dist-electron/`
3. `wait-on` 等兩者就緒後啟動 Electron

## 打包分發

```powershell
npm run package
```

會跑 `vite build` + `tsc -p electron` + `electron-builder`，第一次大約 2–3 分鐘。

產出位置：

```
release/
└── TS Clipper-0.1.0-win-x64.zip      # 約 300–400 MB（含 ffmpeg/ffprobe/mpv）
```

### 給收件者使用

1. 解壓 `TS Clipper-0.1.0-win-x64.zip` 到任一資料夾（桌面、D 槽都可）
2. 進入解壓後的 `TS Clipper-0.1.0-win-x64\` 資料夾，雙擊 **`TS Clipper.exe`**
3. 第一次跑 Windows SmartScreen 會跳警告（因為沒有付費簽章）
   - 點「**其他資訊**」→「**仍要執行**」即可
4. 收件者**不需要**安裝 Node、ffmpeg、mpv，全部已內含

### 切換成 NSIS 安裝檔（如要做正式版）

編輯 [package.json](package.json) 的 `build.win.target` 改成：

```jsonc
"target": [{ "target": "nsis", "arch": ["x64"] }]
```

再跑一次 `npm run package`。

### 包體積說明

`resources/bin/` 三個 binary 加起來約 500 MB，是 zip 主要的體積來源。若想瘦身：

- ffmpeg：BtbN 的 `gpl-shared` build 比 `gpl`（靜態）小，但需額外帶 DLL
- mpv：已是最精簡（shinchiro 靜態 build）
- 移除 `ffprobe.exe`：若不需 probe 功能可省 ~190 MB，但會失去自動偵測影片資訊

## 鍵盤快捷鍵

| 鍵 | 行為 |
|---|---|
| Space | 播放 / 暫停 |
| ← / → | 上一影格 / 下一影格 |
| Shift + ← / → | 倒退 / 前進 5 秒 |
| ↑ / ↓ | 音量 +5 / −5（範圍 0–150） |
| M | 靜音切換 |
| I | 設定入點 |
| O | 設定出點 |
| S | 截圖目前畫面 |

## 架構重點

### mpv 嵌入

主視窗（React UI）旁邊有一個 child `BrowserWindow`（`videoWindow`），無邊框、不可聚焦。mpv 啟動時傳 `--wid=<HWND of videoWindow>`，於該 HWND 內繪製。

React 中 `PlayerSurface` 用 `ResizeObserver` 監測自身位置，透過 IPC 通知主程序 `videoWindow.setBounds(...)`，達到「mpv 蓋在 React 預留區塊上」的效果。視窗 minimize / move / resize 時皆會同步。

**關鍵：** [electron/main.ts](electron/main.ts) 內呼叫 `app.disableHardwareAcceleration()`。否則 Chromium 的 DirectComposition 層會壓在 mpv 子 HWND 上面導致黑畫面。UI 改走軟體渲染（介面很輕，無感）；mpv 自己仍走 GPU 解碼。

副作用：Chromium 的 modal（例如 Export 對話框）會被 mpv 蓋住，所以對話框開啟時 App.tsx 會傳 `setVideoBounds(null)` 暫時隱藏 mpv 視窗。截圖用的存檔對話框是 Windows 原生 Common Dialog，不受影響。

### mpv IPC

主程序用 `--input-ipc-server=\\.\pipe\ts-clipper-mpv-<rand>` 啟動 mpv，再以 `net.createConnection` 連入該 named pipe，發送 JSON-RPC 命令。observe 的 properties：`time-pos`、`duration`、`pause`、`eof-reached`、`volume`、`mute`，全部推到 React 即時更新。

### 截圖

呼叫 mpv 內建的 `screenshot-to-file <path> video` 命令，直接把目前 decoded frame 寫成 PNG 或 JPEG（依副檔名自動切換 `screenshot-format`）。原始解析度、無 OSD、無重新編碼，幾十毫秒完成。

### ffmpeg 輸出

- **Stream copy**：`-ss` 在 `-i` 之前（快速 keyframe seek）、`-c copy`、`-bsf:a aac_adtstoasc`、`+faststart`。
- **重新編碼**：`-ss` 在 `-i` 之後（精準到影格）、自動選擇 `h264_nvenc` / `h264_qsv` / `h264_amf` / `libx264`。

進度透過 `-progress pipe:1` 解析 `out_time_ms`、`speed` 推送到 UI。

## 已知限制

- mpv 子視窗是獨立 Win32 window，跨螢幕拖動時可能有一影格的延遲對位。
- Stream copy 模式下入點會對齊到最近的關鍵幀，秒數可能略偏。
- 尚未支援多片段串接（規劃中：以 concat demuxer 實作）。
