/**
 * generate-icons.js
 * Creates GainTrack branded icons using pngjs (already a project dependency).
 * Run from: c:\gaintrack\gaintrack\frontend
 *   node scripts/generate-icons.js
 *
 * Generates:
 *   assets/images/icon.png            1024x1024  (App Store / Play Store)
 *   assets/images/adaptive-icon.png   1024x1024  (Android adaptive foreground)
 *   assets/images/favicon.png           64x64    (Web)
 *   assets/images/splash-image.png     240x240   (Used in AuthSplash fallback)
 *   assets/images/notification-icon.png 96x96    (Android notification)
 */

const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

// ── Brand colours ──────────────────────────────────────────────────────────
const BG    = [26,  26,  26,  255];  // #1A1A1A background
const TRANS = [0,   0,   0,   0];    // transparent (for adaptive icon)
const OG    = [255, 98,  0,   255];  // #FF6200 orange
const OGA   = [229, 90,  0,   255];  // #E55A00 slightly darker orange arm
const WH    = [255, 255, 255, 255];  // white

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

// ── Draw a barbell / dumbbell icon ─────────────────────────────────────────
// The barbell:
//   • Two thick orange plates (tall rectangles with rounded corners)
//   • Thin orange bar connecting them
//   • Small darker grip knurling in the centre
//

function drawBarbell(png, transparent) {
  const S = png.width;      // canvas size (assumed square)
  const mid = S / 2;

  // Background
  if (transparent) {
    // Fully transparent — adaptive icon sits on the launcher's bg
    png.data.fill(0);
  } else {
    // Dark background with a subtle orange-tinted rounded square card
    png.data.fill(0);
    const cardPad = S * 0.04;
    roundRect(png, cardPad, cardPad, S - cardPad, S - cardPad, S * 0.14, BG);
  }

  // ── Barbell geometry (scaled relative to S) ──
  const barY1    = mid - S * 0.052;   // top of horizontal bar
  const barY2    = mid + S * 0.052;   // bottom of horizontal bar
  const barH     = barY2 - barY1;

  const plateW   = S * 0.130;          // plate width
  const plateH   = S * 0.420;          // plate height
  const plateR   = S * 0.038;          // plate corner radius

  // Left plate
  const lx1 = S * 0.090;
  const lx2 = lx1 + plateW;
  roundRect(png, lx1, mid - plateH / 2, lx2, mid + plateH / 2, plateR, OG);

  // Right plate
  const rx2 = S * 0.910;
  const rx1 = rx2 - plateW;
  roundRect(png, rx1, mid - plateH / 2, rx2, mid + plateH / 2, plateR, OG);

  // Bar
  rect(png, lx2, barY1, rx1, barY2, OG);

  // Grip (darker stripe in the centre)
  const gripW = S * 0.18;
  rect(png, mid - gripW / 2, barY1, mid + gripW / 2, barY2, OGA);

  // Grip knurling — thin white horizontal lines
  const nLines = 5;
  const lineH  = Math.max(1, Math.round(barH * 0.08));
  for (let i = 0; i <= nLines; i++) {
    const lineY = barY1 + (barH / nLines) * i;
    rect(png, mid - gripW / 2 + 2, lineY, mid + gripW / 2 - 2, lineY + lineH, WH);
  }
}

// ── Generate icons ─────────────────────────────────────────────────────────

const OUT = path.resolve(__dirname, '../assets/images');

// 1. App icon — 1024x1024 on dark bg
;(() => {
  const png = new PNG({ width: 1024, height: 1024 });
  drawBarbell(png, false);
  save(png, path.join(OUT, 'icon.png'));
})();

// 2. Adaptive icon foreground — 1024x1024 transparent bg
;(() => {
  const png = new PNG({ width: 1024, height: 1024 });
  drawBarbell(png, true);
  save(png, path.join(OUT, 'adaptive-icon.png'));
})();

// 3. Splash image (used as fallback logo reference) — 240x240
;(() => {
  const png = new PNG({ width: 240, height: 240 });
  drawBarbell(png, false);
  save(png, path.join(OUT, 'splash-image.png'));
})();

// 4. Notification icon — 96x96 (Android, should be white on transparent)
;(() => {
  const png = new PNG({ width: 96, height: 96 });
  png.data.fill(0);
  drawBarbell(png, true);
  // Flatten to white on transparent for Android notification spec
  for (let i = 0; i < png.width * png.height * 4; i += 4) {
    if (png.data[i + 3] > 0) {
      png.data[i]     = 255;
      png.data[i + 1] = 255;
      png.data[i + 2] = 255;
      png.data[i + 3] = 255;
    }
  }
  save(png, path.join(OUT, 'notification-icon.png'));
})();

// 5. Favicon — 64x64
;(() => {
  const png = new PNG({ width: 64, height: 64 });
  drawBarbell(png, false);
  save(png, path.join(OUT, 'favicon.png'));
})();

console.log('\n🏋️  All GainTrack icons generated successfully.');
