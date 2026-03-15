/**
 * verify-icons.js
 * Validates icon dimensions and notification icon color constraints.
 * Run from: c:\gaintrack\gaintrack\frontend
 *   node scripts/verify-icons.js
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '../assets/images');

const expected = [
  { name: 'icon.png', width: 1024, height: 1024 },
  { name: 'adaptive-icon.png', width: 1024, height: 1024 },
  { name: 'adaptive-monochrome.png', width: 1024, height: 1024 },
  { name: 'splash-image.png', width: 240, height: 240 },
  { name: 'notification-icon.png', width: 96, height: 96 },
  { name: 'favicon.png', width: 64, height: 64 },
];

function loadPng(filePath) {
  const data = fs.readFileSync(filePath);
  return PNG.sync.read(data);
}

function ensureDimensions() {
  const errors = [];

  for (const item of expected) {
    const filePath = path.join(ROOT, item.name);
    if (!fs.existsSync(filePath)) {
      errors.push(`${item.name}: missing file`);
      continue;
    }

    const png = loadPng(filePath);
    if (png.width !== item.width || png.height !== item.height) {
      errors.push(
        `${item.name}: expected ${item.width}x${item.height}, found ${png.width}x${png.height}`
      );
    }
  }

  return errors;
}

function ensureNotificationIsWhiteOnTransparent() {
  const errors = [];
  const filePath = path.join(ROOT, 'notification-icon.png');

  if (!fs.existsSync(filePath)) {
    errors.push('notification-icon.png: missing file');
    return errors;
  }

  const png = loadPng(filePath);

  for (let i = 0; i < png.width * png.height * 4; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const a = png.data[i + 3];

    if (a === 0) {
      continue;
    }

    if (r !== 255 || g !== 255 || b !== 255) {
      errors.push('notification-icon.png: non-transparent pixels must be pure white');
      break;
    }
  }

  return errors;
}

function main() {
  const errors = [
    ...ensureDimensions(),
    ...ensureNotificationIsWhiteOnTransparent(),
  ];

  if (errors.length > 0) {
    console.error('Icon verification failed:');
    for (const err of errors) {
      console.error(`- ${err}`);
    }
    process.exit(1);
  }

  console.log('Icon verification passed.');
}

main();
