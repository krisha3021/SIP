// Measures WCAG 2.x contrast ratios for the design tokens in src/app/globals.css.
// Usage: node scripts/contrast.mjs   (exits 1 if any required pair fails)
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

function block(selectorRegex) {
  const m = css.match(selectorRegex);
  if (!m) throw new Error(`token block not found: ${selectorRegex}`);
  const tokens = {};
  for (const [, k, v] of m[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[k] = v;
  return tokens;
}

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [foreground, background, minimum]; 4.5 for text, 3 for UI components / graphics.
const pairs = [
  ['text', 'bg', 4.5], ['text', 'surface', 4.5], ['text', 'surface-2', 4.5],
  ['text-muted', 'bg', 4.5], ['text-muted', 'surface', 4.5], ['text-muted', 'surface-2', 4.5],
  ['brand', 'bg', 4.5], ['brand', 'surface', 4.5], ['brand-contrast', 'brand', 4.5], ['brand-strong', 'brand-soft', 4.5],
  ['danger', 'surface', 4.5], ['danger', 'danger-soft', 4.5],
  ['warning', 'surface', 4.5], ['warning', 'warning-soft', 4.5],
  ['info', 'info-soft', 4.5],
  ['focus', 'bg', 3], ['focus', 'surface', 3], ['border-strong', 'surface', 3],
  ['chart-1', 'surface', 3], ['chart-2', 'surface', 3], ['chart-3', 'surface', 3],
];

const themes = {
  light: block(/:root\s*\{([^}]*)\}/),
  dark: block(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/),
};

let failed = 0;
for (const [name, t] of Object.entries(themes)) {
  console.log(`\n${name}`);
  for (const [fg, bg, min] of pairs) {
    if (!t[fg] || !t[bg]) { console.log(`  missing ${fg}/${bg}`); failed++; continue; }
    const r = ratio(t[fg], t[bg]);
    const pass = r >= min;
    if (!pass) failed++;
    console.log(`  ${pass ? 'PASS' : 'FAIL'} ${fg} on ${bg}: ${r.toFixed(2)}:1 (min ${min})`);
  }
}
process.exit(failed ? 1 : 0);
