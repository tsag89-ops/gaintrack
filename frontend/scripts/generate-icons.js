/**
 * generate-icons.js
 * Builds icon assets from assets/images/icon-master.png.
 * Run from: c:\gaintrack\gaintrack\frontend
 *   node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ASSETS_DIR = path.resolve(__dirname, '../assets/images');
const MASTER_PATH = path.join(ASSETS_DIR, 'icon-master.png');

function loadPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function savePng(fileName, png) {
  const outPath = path.join(ASSETS_DIR, fileName);
  fs.writeFileSync(outPath, PNG.sync.write(png));
  console.log(`Saved ${fileName}`);
}

function rgbaAt(png, x, y) {
  const idx = (png.width * y + x) << 2;
  return [png.data[idx], png.data[idx + 1], png.data[idx + 2], png.data[idx + 3]];
}

function setRgba(png, x, y, rgba) {
  const idx = (png.width * y + x) << 2;
  png.data[idx] = rgba[0];
  png.data[idx + 1] = rgba[1];
  png.data[idx + 2] = rgba[2];
  png.data[idx + 3] = rgba[3];
}

function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function avgCornerBackground(png) {
  const corners = [
    rgbaAt(png, 0, 0),
    rgbaAt(png, png.width - 1, 0),
    rgbaAt(png, 0, png.height - 1),
    rgbaAt(png, png.width - 1, png.height - 1),
  ];

  const sum = corners.reduce(
    (acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]],
    [0, 0, 0]
  );

  return [Math.round(sum[0] / 4), Math.round(sum[1] / 4), Math.round(sum[2] / 4)];
}

function makeForegroundMask(png, bgRgb, threshold) {
  const mask = new Uint8Array(png.width * png.height);

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const [r, g, b, a] = rgbaAt(png, x, y);
      if (a === 0) continue;
      const d = colorDistance([r, g, b], bgRgb);
      if (d > threshold) {
        mask[y * png.width + x] = 1;
      }
    }
  }

  return mask;
}

function findSeed(mask, width, height) {
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  if (mask[cy * width + cx]) return [cx, cy];

  const maxRadius = Math.floor(Math.max(width, height) * 0.4);
  for (let r = 1; r <= maxRadius; r += 1) {
    for (let y = Math.max(0, cy - r); y <= Math.min(height - 1, cy + r); y += 1) {
      for (let x = Math.max(0, cx - r); x <= Math.min(width - 1, cx + r); x += 1) {
        if (Math.abs(x - cx) !== r && Math.abs(y - cy) !== r) continue;
        if (mask[y * width + x]) return [x, y];
      }
    }
  }

  return null;
}

function connectedComponent(mask, width, height, seed) {
  const out = new Uint8Array(width * height);
  const queue = [seed];
  out[seed[1] * width + seed[0]] = 1;

  let minX = seed[0];
  let minY = seed[1];
  let maxX = seed[0];
  let maxY = seed[1];

  while (queue.length > 0) {
    const [x, y] = queue.pop();

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;

    for (let ny = y - 1; ny <= y + 1; ny += 1) {
      for (let nx = x - 1; nx <= x + 1; nx += 1) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const idx = ny * width + nx;
        if (!mask[idx] || out[idx]) continue;
        out[idx] = 1;
        queue.push([nx, ny]);
      }
    }
  }

  return {
    mask: out,
    bounds: { minX, minY, maxX, maxY },
  };
}

function squareBounds(bounds, width, height, pad) {
  let minX = Math.max(0, bounds.minX - pad);
  let minY = Math.max(0, bounds.minY - pad);
  let maxX = Math.min(width - 1, bounds.maxX + pad);
  let maxY = Math.min(height - 1, bounds.maxY + pad);

  let w = maxX - minX + 1;
  let h = maxY - minY + 1;

  if (w > h) {
    const diff = w - h;
    minY = Math.max(0, minY - Math.floor(diff / 2));
    maxY = Math.min(height - 1, maxY + Math.ceil(diff / 2));
  } else if (h > w) {
    const diff = h - w;
    minX = Math.max(0, minX - Math.floor(diff / 2));
    maxX = Math.min(width - 1, maxX + Math.ceil(diff / 2));
  }

  const size = Math.max(maxX - minX + 1, maxY - minY + 1);
  maxX = Math.min(width - 1, minX + size - 1);
  maxY = Math.min(height - 1, minY + size - 1);

  return { minX, minY, maxX, maxY };
}

function cropComponentTransparent(src, componentMask, bounds) {
  const size = Math.max(bounds.maxX - bounds.minX + 1, bounds.maxY - bounds.minY + 1);
  const out = new PNG({ width: size, height: size });

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sx = bounds.minX + x;
      const sy = bounds.minY + y;
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      const keep = componentMask[sy * src.width + sx] === 1;
      if (!keep) continue;
      setRgba(out, x, y, rgbaAt(src, sx, sy));
    }
  }

  return out;
}

function resizeNearest(src, size) {
  const out = new PNG({ width: size, height: size });

  for (let y = 0; y < size; y += 1) {
    const sy = Math.min(src.height - 1, Math.floor((y / size) * src.height));
    for (let x = 0; x < size; x += 1) {
      const sx = Math.min(src.width - 1, Math.floor((x / size) * src.width));
      setRgba(out, x, y, rgbaAt(src, sx, sy));
    }
  }

  return out;
}

function flattenVisibleToWhite(png) {
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] > 0) {
      png.data[i] = 255;
      png.data[i + 1] = 255;
      png.data[i + 2] = 255;
      png.data[i + 3] = 255;
    }
  }
}

function main() {
  if (!fs.existsSync(MASTER_PATH)) {
    throw new Error(`Missing master icon source: ${MASTER_PATH}`);
  }

  const master = loadPng(MASTER_PATH);
  const bg = avgCornerBackground(master);
  const mask = makeForegroundMask(master, bg, 18);
  const seed = findSeed(mask, master.width, master.height);

  if (!seed) {
    throw new Error('Could not detect icon shape in icon-master.png.');
  }

  const comp = connectedComponent(mask, master.width, master.height, seed);
  const bounds = squareBounds(comp.bounds, master.width, master.height, 8);
  const sourceTransparent = cropComponentTransparent(master, comp.mask, bounds);

  savePng('icon.png', resizeNearest(sourceTransparent, 1024));
  savePng('adaptive-icon.png', resizeNearest(sourceTransparent, 1024));

  const mono = resizeNearest(sourceTransparent, 1024);
  flattenVisibleToWhite(mono);
  savePng('adaptive-monochrome.png', mono);

  savePng('splash-image.png', resizeNearest(sourceTransparent, 240));

  const notification = resizeNearest(sourceTransparent, 96);
  flattenVisibleToWhite(notification);
  savePng('notification-icon.png', notification);

  savePng('favicon.png', resizeNearest(sourceTransparent, 64));

  console.log('All icon assets generated from icon-master.png.');
}

main();
