/**
 * The dev tree is on a case-insensitive filesystem, so a wrong-case asset
 * path works locally and 404s inside the asar, where lookups are
 * case-sensitive. This compares every asset reference in the source
 * against the real filenames on disk.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCES = ['src/index.html', 'src/renderer.js', 'src/style.css'];

/* the real tree, with exact casing */
const tree = new Map();

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else {
      tree.set(path.relative(ROOT, full).split(path.sep).join('/'), full);
    }
  }
}

walk(path.join(ROOT, 'assets'));

const problems = [];
let checked = 0;

for (const rel of SOURCES) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');

  // src="...", and the JS template literals that build the same strings
  const refs = [
    ...src.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g),
    ...src.matchAll(/["'`](\.\.\/assets\/[^"'`]+)["'`]/g)
  ].map((m) => m[1]);

  for (const ref of refs) {
    if (!ref.includes('assets/')) continue;

    checked++;

    // the reference is written relative to src/, so drop the ../
    const want = ref.replace(/^\.\.\//, '').split('?')[0].split('#')[0];

    if (tree.has(want)) continue;

    // is it only the casing that is wrong?
    const match = [...tree.keys()].find(
      (k) => k.toLowerCase() === want.toLowerCase()
    );

    problems.push({
      file: rel,
      ref,
      actual: match || 'NO SUCH FILE'
    });
  }
}

console.log(`checked ${checked} asset references`);
console.log(`problems: ${problems.length}\n`);

problems.forEach((p) =>
  console.log(
    `  ${p.file}\n    asks for : ${p.ref}\n    should be : ${p.actual}\n`
  )
);
