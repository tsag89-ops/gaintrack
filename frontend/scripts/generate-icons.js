/**
 * generate-icons.js
 * Creates GainTrack branded icons using pngjs (already a project dependency).
 * Run from: c:\gaintrack\gaintrack\frontend
 *   node scripts/generate-icons.js
 *
 * Generates:
 *   assets/images/icon.png            1024x1024  (App Store / Play Store)
 *   assets/images/adaptive-icon.png   1024x1024  (Android adaptive foreground)
 *   assets/images/adaptive-monochrome.png 1024x1024 (Android 13 themed icon)
 *   assets/images/favicon.png           64x64    (Web)
 *   assets/images/splash-image.png     240x240   (Used in AuthSplash fallback)
 *   assets/images/notification-icon.png 96x96    (Android notification)
 */

const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

// ── Brand colours ──────────────────────────────────────────────────────────
const BG    = [26,  26,  26,  255];  // #1A1A1A background
const CARD  = [255, 98,  0,   32];   // #FF620020 login-style translucent tile
const OG    = [255, 98,  0,   255];  // #FF6200 orange heart
const WH    = [255, 255, 255, 255];  // white (notification icon)

// ── Helpers ────────────────────────────────────────────────────────────────

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function setPixel(png, x, y, rgba) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) * 4;
  png.data[idx]     = rgba[0];
  png.data[idx + 1] = rgba[1];
  png.data[idx + 2] = rgba[2];
  png.data[idx + 3] = rgba[3];
}

/** Fill an axis-aligned rectangle */
function rect(png, x1, y1, x2, y2, rgba) {
  for (let y = Math.round(y1); y <= Math.round(y2); y++) {
    for (let x = Math.round(x1); x <= Math.round(x2); x++) {
      setPixel(png, x, y, rgba);
    }
  }
}

/** Fill a circle */
function circle(png, cx, cy, r, rgba) {
  for (let y = Math.round(cy - r); y <= Math.round(cy + r); y++) {
    for (let x = Math.round(cx - r); x <= Math.round(cx + r); x++) {
      if (dist(x, y, cx, cy) <= r) setPixel(png, x, y, rgba);
    }
  }
}

/** Fill a rounded rectangle */
function roundRect(png, x1, y1, x2, y2, radius, rgba) {
  rect(png, x1 + radius, y1, x2 - radius, y2, rgba);
  rect(png, x1, y1 + radius, x2, y2 - radius, rgba);
  circle(png, x1 + radius, y1 + radius, radius, rgba);
  circle(png, x2 - radius, y1 + radius, radius, rgba);
  circle(png, x1 + radius, y2 - radius, radius, rgba);
  circle(png, x2 - radius, y2 - radius, radius, rgba);
}

/** Save a PNG to disk */
function save(png, filename) {
  const buf = PNG.sync.write(png);
  fs.writeFileSync(filename, buf);
  console.log(`✅  Saved ${filename}`);
}

/** Convert any visible pixel to a single solid color (used for monochrome assets). */
function flattenVisibleToColor(png, rgba) {
  for (let i = 0; i < png.width * png.height * 4; i += 4) {
    if (png.data[i + 3] > 0) {
      png.data[i] = rgba[0];
      png.data[i + 1] = rgba[1];
      png.data[i + 2] = rgba[2];
      png.data[i + 3] = rgba[3];
    }
  }
}

// ── Draw a login-style heart logo ────────────────────────────────────────────
function drawLoginHeartLogo(png, transparent) {
  const S = png.width;      // canvas size (assumed square)
  const mid = S / 2;

  // Background
  if (transparent) {
    // Fully transparent — adaptive icon sits on the launcher's bg
    png.data.fill(0);
  } else {
    // Dark background with centered rounded card.
    png.data.fill(0);
    const cardPad = S * 0.12;
    roundRect(png, cardPad, cardPad, S - cardPad, S - cardPad, S * 0.16, CARD);
  }

  // Heart shape using implicit heart equation.
  // x and y are normalized in [-1, 1].
  const heartCx = mid;
  const heartCy = S * 0.52;
  const heartScale = S * 0.24;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = (x - heartCx) / heartScale;
      const ny = ((y - heartCy) / heartScale) * -1;
      const f = (nx * nx + ny * ny - 1) ** 3 - nx * nx * ny * ny * ny;
      if (f <= 0) {
        setPixel(png, x, y, OG);
      }
    }
  }

  // For transparent assets, ensure visible pixels are white-only where required.
  if (transparent) {
    flattenVisibleToColor(png, WH);
  }
}

// ── Generate icons ─────────────────────────────────────────────────────────

const OUT = path.resolve(__dirname, '../assets/images');

// 1. App icon — 1024x1024 on dark bg
;(() => {
  const png = new PNG({ width: 1024, height: 1024 });
  drawLoginHeartLogo(png, false);
  save(png, path.join(OUT, 'icon.png'));
})();

// 2. Adaptive icon foreground — 1024x1024 transparent bg
;(() => {
  const png = new PNG({ width: 1024, height: 1024 });
  drawLoginHeartLogo(png, true);
  save(png, path.join(OUT, 'adaptive-icon.png'));
})();

// 2b. Adaptive monochrome icon — 1024x1024 transparent bg (Android 13 themed icon)
;(() => {
  const png = new PNG({ width: 1024, height: 1024 });
  drawLoginHeartLogo(png, true);
  flattenVisibleToColor(png, WH);
  save(png, path.join(OUT, 'adaptive-monochrome.png'));
})();

// 3. Splash image (used as fallback logo reference) — 240x240
;(() => {
  const png = new PNG({ width: 240, height: 240 });
  drawLoginHeartLogo(png, false);
  save(png, path.join(OUT, 'splash-image.png'));
})();

// 4. Notification icon — 96x96 (Android, should be white on transparent)
;(() => {
  const png = new PNG({ width: 96, height: 96 });
  png.data.fill(0);
  drawLoginHeartLogo(png, true);
  flattenVisibleToColor(png, WH);
  save(png, path.join(OUT, 'notification-icon.png'));
})();

// 5. Favicon — 64x64
;(() => {
  const png = new PNG({ width: 64, height: 64 });
  drawLoginHeartLogo(png, false);
  save(png, path.join(OUT, 'favicon.png'));
})();

console.log('\n❤️  All GainTrack icons generated successfully.');
