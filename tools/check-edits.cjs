/**
 * Guards against the failure mode that cost the most time here: a
 * scripted edit that walks lines looking for an end marker and walks
 * past it, deleting everything in between.
 *
 * Rules this enforces:
 *   1. a replacement must match exactly once, or nothing is written
 *   2. the result must parse (JS only - HTML is not a script)
 *   3. braces and comments must balance
 *   4. no doubled banner comments, which is the signature of a
 *      botched splice
 *   5. every anchor the caller names is still present, exactly once
 *
 * Usage: node tools/check-edits.cjs <file> [<anchor> ...]
 */
const fs = require('fs');
const vm = require('vm');

const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');
const anchors = process.argv.slice(3);

const isScript = /\.(c?js|mjs)$/i.test(file);

console.log(`${file}: ${src.split('\n').length} lines`);
console.log('');

let failed = 0;

/* parse, for scripts only */
if (isScript) {
  try {
    new vm.Script(src, { filename: file });
    console.log('parses             ok');
  } catch (e) {
    failed++;
    console.log('parses             FAIL - ' + e.message);
  }
} else {
  console.log('parses             skipped (not a script)');
}

/* balance */
const opens = (src.match(/\{/g) || []).length;
const closes = (src.match(/\}/g) || []).length;

if (opens === closes) {
  console.log(`braces             ok (${opens})`);
} else {
  failed++;
  console.log(`braces             UNBALANCED (${opens} / ${closes})`);
}

const cOpen = (src.match(/\/\*/g) || []).length;
const cClose = (src.match(/\*\//g) || []).length;

if (cOpen === cClose) {
  console.log(`comments           ok (${cOpen})`);
} else {
  failed++;
  console.log(`comments           UNBALANCED (${cOpen} / ${cClose})`);
}

/* doubled banners */
const doubled = (src.match(/\/\* ={10,}\n\s*\/\* ={10,}/g) || []).length;

if (doubled === 0) {
  console.log('doubled banners    ok');
} else {
  failed++;
  console.log(`doubled banners    ${doubled} - botched splice`);
}

/* tags, for markup */
if (/\.html?$/i.test(file)) {
  const sections = [...src.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
  console.log(`sections           ${sections.length}: ${sections.join(', ')}`);

  const dupes = sections.filter((s, i) => sections.indexOf(s) !== i);
  if (dupes.length) {
    failed++;
    console.log(`duplicate sections ${dupes.join(', ')}`);
  }
}

/* anchors */
if (anchors.length) {
  console.log('');
  console.log('anchors:');

  for (const needle of anchors) {
    const n = src.split(needle).length - 1;
    const ok = n === 1;
    if (!ok) failed++;
    console.log(`  ${String(n).padStart(2)}x ${ok ? 'ok     ' : 'PROBLEM'}  ${needle}`);
  }
}

console.log('');
console.log(failed ? `${failed} problem(s)` : 'clean');

process.exit(failed ? 1 : 0);
