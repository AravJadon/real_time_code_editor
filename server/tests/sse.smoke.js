/**
 * Smoke test for the SSE parser — run with `npm run test:sse`.
 *
 * The regression: the AI panel split each network chunk on "\n" on its own, so any
 * event straddling a chunk boundary was silently discarded and the streamed answer
 * lost words. This feeds the same stream at every possible split point and checks
 * the reassembled text is always identical.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'sse.js'),
    'utf8'
);
// eslint-disable-next-line no-new-func
const { createSSEParser } = new Function(
    `${source.replace(/^export\s+/gm, '')}; return { createSSEParser };`
)();

const TOKENS = [
    'The `sum` function ',
    'has an off-by-one error.\n\n```javascript\n',
    'for (let i = 0; i < arr.length; i++) {\n',
    '  total += arr[i];\n}\n```\n',
    'Unicode check: café — ✅ 🎉',
];

const EXPECTED = TOKENS.join('');

const stream =
    TOKENS.map((t) => `data: ${JSON.stringify({ type: 'token', content: t })}\n\n`).join('') +
    `data: ${JSON.stringify({ type: 'done', model: 'gemini-3.6-flash', ragSources: [{ fileName: 'sum.js' }] })}\n\n` +
    'data: [DONE]\n\n';

function run(chunks) {
    let text = '';
    let done = null;
    const parser = createSSEParser((e) => {
        if (e.type === 'token') text += e.content;
        if (e.type === 'done') done = e;
    });
    chunks.forEach((c) => parser.push(c));
    parser.flush();
    return { text, done };
}

// ── 1. Whole stream in one chunk ──
let r = run([stream]);
assert.strictEqual(r.text, EXPECTED);
assert.ok(r.done && r.done.model === 'gemini-3.6-flash');
console.log('✓ single chunk: full text and done event');

// ── 2. Every possible two-way split — this is what used to drop tokens ──
let failures = 0;
for (let i = 1; i < stream.length; i++) {
    const out = run([stream.slice(0, i), stream.slice(i)]);
    if (out.text !== EXPECTED || !out.done) failures += 1;
}
assert.strictEqual(failures, 0, `${failures} of ${stream.length - 1} split points lost data`);
console.log(`✓ all ${stream.length - 1} two-way split points reassemble identically`);

// ── 3. Byte-at-a-time (worst case) ──
r = run(stream.split(''));
assert.strictEqual(r.text, EXPECTED, 'byte-at-a-time delivery lost data');
assert.ok(r.done, 'byte-at-a-time lost the done event');
console.log('✓ byte-at-a-time delivery reassembles identically');

// ── 4. A malformed event must not kill the rest of the stream ──
r = run([
    'data: {"type":"token","content":"A"}\n\n',
    'data: {not valid json\n\n',
    'data: {"type":"token","content":"B"}\n\n',
]);
assert.strictEqual(r.text, 'AB', 'a malformed event should be skipped, not fatal');
console.log('✓ malformed event skipped without breaking the stream');

// ── 5. An error event is delivered ──
let err = null;
const p = createSSEParser((e) => { if (e.type === 'error') err = e.error; });
p.push('data: {"type":"error","err');
p.push('or":"quota exceeded"}\n\n');
p.flush();
assert.strictEqual(err, 'quota exceeded', 'split error event was lost');
console.log('✓ error event survives a mid-event split');

// ── 6. A final event with no trailing newline is flushed ──
r = run(['data: {"type":"token","content":"tail"}']);
assert.strictEqual(r.text, 'tail', 'flush() did not emit the trailing event');
console.log('✓ trailing event without newline is flushed');

console.log('\nAll SSE checks passed.');
