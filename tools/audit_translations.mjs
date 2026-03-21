import { readFileSync } from 'fs';

const ALLOWED_EQUAL = new Set([
  'GAINTRACK',
  'GainTrack',
  'GainTrack Pro',
  'PRO',
  'FREE',
  '{{message}}',
  '{{error}}',
]);

// Read file and extract the translations object via a light transform
const raw = readFileSync('frontend/src/i18n/translations.ts', 'utf8');

// Remove the TypeScript type annotation on the const declaration
let src = raw
  .replace(/^export\s+type\s+SupportedLocale[^;]+;/m, '')
  .replace(/^export\s+const\s+DEFAULT_LOCALE[^;]+;/m, '')
  .replace(/^export\s+const\s+LANGUAGE_STORAGE_KEY[^;]+;/m, '')
  .replace(/^export\s+const\s+SUPPORTED_LANGUAGES[\s\S]*?\];/m, '')
  .replace(/^type\s+TranslationLeaf[^;]+;/m, '')
  .replace(/^type\s+TranslationTree[^;]+;/m, '')
  // Remove the typed declaration: const translations: Record<SupportedLocale, TranslationTree> =
  .replace(/const\s+translations\s*:\s*Record<[^>]+>\s*=/, 'const translations =')
  // Remove trailing export default if any
  .replace(/^export\s+default\s+translations\s*;?/m, '');

// Extract just the object literal from const translations = { ... };
const startIdx = src.indexOf('const translations =');
if (startIdx === -1) throw new Error('Could not find translations object');

// Find the opening brace
const braceStart = src.indexOf('{', startIdx);
let depth = 0;
let end = braceStart;
for (let i = braceStart; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') {
    depth--;
    if (depth === 0) { end = i; break; }
  }
}

const objSrc = src.slice(braceStart, end + 1);

// Evaluate it in a safe-ish way
let translations;
try {
  translations = (new Function(`return ${objSrc}`))();
} catch (e) {
  console.error('Failed to eval translations object:', e.message);
  process.exit(1);
}

// Flatten a nested translation tree into dot-separated paths with leaf values
function flatten(obj, prefix = '') {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      result[path] = v.join('\n');
    } else if (typeof v === 'object' && v !== null) {
      Object.assign(result, flatten(v, path));
    } else {
      result[path] = v;
    }
  }
  return result;
}

const locales = ['el', 'de', 'fr', 'it'];
const enFlat = flatten(translations['en']);
const enKeys = new Set(Object.keys(enFlat));

const results = {};
const equalStringsGlobal = {}; // key: en string value, count across all locales

for (const locale of locales) {
  const flat = flatten(translations[locale] || {});
  const localeKeys = new Set(Object.keys(flat));

  const missing = [];
  const equalToEn = [];
  const equalToEnAllowed = [];

  for (const key of enKeys) {
    if (!localeKeys.has(key)) {
      missing.push(key);
    } else {
      const enVal = enFlat[key];
      const locVal = flat[key];
      if (enVal === locVal) {
        if (ALLOWED_EQUAL.has(enVal.trim())) {
          equalToEnAllowed.push({ key, value: enVal });
        } else {
          equalToEn.push({ key, value: enVal });
          // Tally repeated equal strings
          equalStringsGlobal[enVal] = (equalStringsGlobal[enVal] || 0) + 1;
        }
      }
    }
  }

  // Also check for extra keys in locale not in en
  const extra = [];
  for (const key of localeKeys) {
    if (!enKeys.has(key)) extra.push(key);
  }

  results[locale] = { missing, equalToEn, equalToEnAllowed, extra };
}

// Summary
const enTotal = enKeys.size;
console.log(`\n${'='.repeat(72)}`);
console.log('TRANSLATION PARITY AUDIT — baseline: en');
console.log(`${'='.repeat(72)}`);
console.log(`\nBaseline (en) total keys: ${enTotal}`);

let grandTotalProblems = 0;
for (const locale of locales) {
  const { missing, equalToEn, equalToEnAllowed, extra } = results[locale];
  const problems = missing.length + equalToEn.length;
  grandTotalProblems += problems;
  console.log(`\n--- ${locale.toUpperCase()} ---`);
  console.log(`  Missing keys       : ${missing.length}`);
  console.log(`  Equal to en (BAD)  : ${equalToEn.length}`);
  console.log(`  Equal to en (OK)   : ${equalToEnAllowed.length}  (allowed exceptions)`);
  console.log(`  Extra keys         : ${extra.length}`);
  console.log(`  Problems total     : ${problems}`);

  if (missing.length > 0) {
    console.log(`\n  First 10 missing keys:`);
    missing.slice(0, 10).forEach(k => console.log(`    - ${k}`));
    if (missing.length > 10) console.log(`    ... and ${missing.length - 10} more`);
  }
  if (equalToEn.length > 0) {
    console.log(`\n  First 10 bad-equal keys (kept same as en):`);
    equalToEn.slice(0, 10).forEach(({ key, value }) =>
      console.log(`    - ${key}: "${value.slice(0, 60)}${value.length > 60 ? '…' : ''}"`)
    );
    if (equalToEn.length > 10) console.log(`    ... and ${equalToEn.length - 10} more`);
  }
}

// Top repeated equal strings across all locales
const sortedEqual = Object.entries(equalStringsGlobal)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);

console.log(`\n${'='.repeat(72)}`);
console.log('TOP REPEATED "EQUAL TO EN" STRINGS (across all locales)');
console.log(`${'='.repeat(72)}`);
if (sortedEqual.length === 0) {
  console.log('  None.');
} else {
  sortedEqual.forEach(([val, cnt]) => {
    const display = val.slice(0, 70).replace(/\n/g, '\\n');
    console.log(`  [${cnt}x] "${display}${val.length > 70 ? '…' : ''}"`);
  });
}

console.log(`\n${'='.repeat(72)}`);
console.log('SUMMARY');
console.log(`${'='.repeat(72)}`);
console.log(`Grand total problems (missing + bad-equal): ${grandTotalProblems}`);
const fullyAchieved = grandTotalProblems === 0;
console.log(`Strict parity fully achieved: ${fullyAchieved ? 'YES ✓' : 'NO ✗'}`);
console.log();
