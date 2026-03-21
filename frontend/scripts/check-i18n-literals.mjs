import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOT = process.cwd();
const TARGETS = ['app', 'src/components'];
const FILE_EXTS = new Set(['.ts', '.tsx']);

const ALLOWED = new Set([
  'PRO',
  'FREE',
  'RPE',
  '1RM',
  'kg',
  'lb',
  'lbs',
  'cm',
  'in',
  'kcal',
  'CSV',
  'W',
  'km',
  'mi',
  'BPM',
  'VO2max',
  'g',
  '%',
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (FILE_EXTS.has(extname(full))) {
      out.push(full);
    }
  }
  return out;
}

function isAllowedLiteral(text) {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (ALLOWED.has(trimmed)) return true;
  if (/^[0-9.+\-/%\s]+$/.test(trimmed)) return true;
  return false;
}

function collectFindings(filePath, content) {
  const findings = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    if (trimmed.includes("t('") || trimmed.includes('t("')) return;

    const jsxTextMatch = line.match(/>\s*([A-Za-z][^<{]*)\s*</);
    if (jsxTextMatch && !isAllowedLiteral(jsxTextMatch[1])) {
      findings.push({ line: lineNo, kind: 'jsx-text', sample: jsxTextMatch[1].trim() });
    }

    const alertMatch = line.match(/Alert\.alert\(\s*['\"]([^'\"]*[A-Za-z][^'\"]*)['\"]/);
    if (alertMatch && !isAllowedLiteral(alertMatch[1])) {
      findings.push({ line: lineNo, kind: 'alert', sample: alertMatch[1].trim() });
    }

    const propMatch = line.match(/\b(placeholder|title|message|label|text)\s*=\s*['\"]([^'\"]*[A-Za-z][^'\"]*)['\"]/);
    if (propMatch && !isAllowedLiteral(propMatch[2])) {
      findings.push({ line: lineNo, kind: `prop-${propMatch[1]}`, sample: propMatch[2].trim() });
    }
  });

  return findings;
}

const files = TARGETS.flatMap((target) => walk(join(ROOT, target)));
const allFindings = [];

for (const file of files) {
  if (file.endsWith('translations.ts')) continue;
  const content = readFileSync(file, 'utf8');
  const findings = collectFindings(file, content);
  findings.forEach((f) => allFindings.push({ file, ...f }));
}

if (allFindings.length === 0) {
  console.log('check:i18n-literals: no obvious hardcoded UI strings found.');
  process.exit(0);
}

console.log(`check:i18n-literals: found ${allFindings.length} potential hardcoded UI string(s).`);
allFindings.slice(0, 200).forEach((f) => {
  const rel = f.file.replace(`${ROOT}\\`, '').replace(/\\/g, '/');
  console.log(`- ${rel}:${f.line} [${f.kind}] ${f.sample}`);
});
console.log('This is a warning-only audit. Route user-visible strings through t() in translations.ts.');
process.exit(0);
