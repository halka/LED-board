# LED Board

A browser-based LED signboard simulator. Design animated text displays with scrolling, blinking, and layering effects, then export as images or videos.

## Features

- **LED dot preview** — renders the board with a configurable dot grid
- **Multiple text layers** — add unlimited layers with independent settings
- **Drag-to-position** — drag text directly on the preview canvas
- **Per-layer controls**:
  - Text content, color, font family, font size, font weight, alignment
  - X / Y position
  - Horizontal scroll (on/off, speed in px/s)
  - Blinking (on/off, interval in ms)
  - Outline (on/off, color, width)
  - Layer order (bring to front / forward / backward / send to back)
- **Global settings** — canvas width, height, background color, LED size, LED gap, recording FPS
- **Export**:
  - Static images: PNG, WebP
  - Animations: WebM, MP4 (MP4 uses [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) via CDN)
- **Auto-calculated recording duration** — computed from scroll distances, speeds, and blink intervals to capture one complete loop
- **Responsive layout** — works on desktop, tablet, and mobile
- **Japanese / English UI** — toggle language in the header; preference saved to `localStorage`

## Usage

1. Open `index.html` in a modern browser (no build step required).
2. Click **Settings** (全体設定) to set canvas size, background color, LED dot size, and gap.
3. Click **Add Text** (文字を追加) to create a text layer.
4. Configure each layer's text, color, font, position, scroll, and blink settings.
5. Drag text on the preview to fine-tune positioning.
6. Use **PNG / WebP** to save a static image, or **WebM / MP4** to record an animation.

## Export Notes

- **WebM**: recorded natively via `MediaRecorder`.
- **MP4**: converted using `ffmpeg.wasm`. The first MP4 export downloads required files from CDN and may take a moment.
- Recording duration is auto-calculated — no manual input needed.
- Output filenames follow the pattern `led-board_YYYYMMDDTHHMMSSZ.ext`.

## Deployment

The project is configured for [Cloudflare Workers](https://workers.cloudflare.com/) via `wrangler.jsonc`.

```bash
npm install -g wrangler
wrangler deploy
```

For local development, any static file server works:

```bash
npx serve .
```

## Browser Requirements

| Feature | Required for |
|---|---|
| Canvas 2D API | Rendering |
| MediaRecorder API | Video recording |
| `<dialog>` element | Settings modals |
| CSS Grid / Flexbox | Layout |

Supported browsers: Chrome 90+, Firefox 88+, Safari 14.1+, Edge 90+.

## License

MIT — see [LICENSE](LICENSE).
