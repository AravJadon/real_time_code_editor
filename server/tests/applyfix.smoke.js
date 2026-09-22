/**
 * Smoke test for the Apply Fix merge rules — run with `npm run test:applyfix`.
 *
 * The regression this locks in: `newCode` is the replacement for `oldCode`, i.e. a
 * snippet. The button used to write it over the whole buffer, so a one-line fix
 * deleted the rest of the file. The one-line case below is a real `apply_code_fix`
 * payload captured from gemini-2.5-flash.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// The util is an ES module for the CRA build; load it here without a bundler.
const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'applyFix.js'),
    'utf8'
);
// Stripping the `export` keyword leaves plain function declarations.
const cjs = source.replace(/^export\s+/gm, '');
// eslint-disable-next-line no-new-func
const load = new Function(`${cjs}; return { mergeFix, findFixTarget };`);
const { mergeFix, findFixTarget } = load();

const FILE = [
    'function sum(arr) {',
    '  let total = 0;',
    '  for (let i = 0; i <= arr.length; i++) {',
    '    total += arr[i];',
    '  }',
    '  return total;',
    '}',
    '',
    'function divide(a, b) {',
    '  return a / b;',
    '}',
].join('\n');

// ── 1. The regression: a one-line snippet must not eat the file ──
const oneLiner = {
    fileName: 'sum.js',
    description: 'Fix off-by-one error',
    oldCode: '  for (let i = 0; i <= arr.length; i++) {',
    newCode: '  for (let i = 0; i < arr.length; i++) {',
};

const r1 = mergeFix(FILE, oneLiner);
assert.ok(r1.ok, 'one-line fix should apply');
assert.ok(r1.code.includes('i < arr.length'), 'fix was not applied');
assert.ok(r1.code.includes('function divide'), 'REGRESSION: rest of the file was destroyed');
assert.strictEqual(r1.code.split('\n').length, FILE.split('\n').length, 'line count changed');
console.log('✓ one-line fix splices in and preserves the rest of the file');

// ── 2. Whole-file rewrite still works ──
const wholeFile = {
    fileName: 'sum.js',
    oldCode: FILE,
    newCode: FILE.replace('i <= arr.length', 'i < arr.length'),
};
const r2 = mergeFix(FILE, wholeFile);
assert.ok(r2.ok && r2.code.includes('i < arr.length') && r2.code.includes('function divide'));
console.log('✓ whole-file rewrite applies');

// ── 3. A stale anchor is refused, not applied blindly ──
const stale = {
    fileName: 'sum.js',
    oldCode: 'for (let i = 0; i <= items.length; i++) {',
    newCode: 'for (let i = 0; i < items.length; i++) {',
};
const r3 = mergeFix(FILE, stale);
assert.strictEqual(r3.ok, false, 'stale anchor must not apply');
assert.strictEqual(r3.reason, 'anchor-not-found');
console.log('✓ stale anchor refused instead of wiping the file');

// ── 4. Re-applying the same fix is a no-op, not a duplicate edit ──
const r4 = mergeFix(r1.code, oneLiner);
assert.strictEqual(r4.ok, false);
assert.strictEqual(r4.reason, 'anchor-not-found');
console.log('✓ re-applying an already-applied fix does not corrupt the file');

// ── 5. Only the first occurrence is replaced, not every match ──
const repeated = 'const a = 1;\nconst a = 1;\n';
const r5 = mergeFix(repeated, { oldCode: 'const a = 1;', newCode: 'const a = 2;' });
assert.strictEqual(r5.code, 'const a = 2;\nconst a = 1;\n');
console.log('✓ replaces the anchored occurrence only');

// ── 6. File targeting: path in the fix vs bare name in the tree ──
const FILES = [
    { _id: '1', name: 'index.js', type: 'file' },
    { _id: '2', name: 'paymentService.js', type: 'file' },
    { _id: '3', name: 'services', type: 'folder' },
];
assert.strictEqual(findFixTarget(FILES, 'services/paymentService.js', null)._id, '2');
assert.strictEqual(findFixTarget(FILES, 'paymentService.js', null)._id, '2');
assert.strictEqual(findFixTarget(FILES, 'nope.js', null), null);
assert.strictEqual(findFixTarget(FILES, '', { _id: '1' })._id, '1', 'falls back to active file');
// A folder must never be picked as a fix target.
assert.strictEqual(findFixTarget(FILES, 'services', null), null);
console.log('✓ fix targeting resolves paths, bare names, and rejects folders');

console.log('\nAll Apply Fix checks passed.');
