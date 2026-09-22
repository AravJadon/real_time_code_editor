/**
 * Smoke test for model-fallback bookkeeping — run with `npm run test:fallback`.
 *
 * Covers the rate-limit cooldown (so a quota-blocked model is not re-tried on
 * every request, which made the UI hang for a minute before erroring), the
 * content-part text extraction, and the error messages the user actually sees.
 */
const assert = require('assert');

process.env.API_KEY = process.env.API_KEY || 'test-key-not-used';
process.env.AI_MODELS = 'model-a,model-b,model-c';

const {
    extractText,
    friendlyError,
    availableModels,
    noteModelFailure,
} = require('../services/aiService');

// ── 1. extractText: the raw-JSON-in-the-chat regression ──
assert.strictEqual(extractText('plain'), 'plain');
assert.strictEqual(extractText(null), '');
assert.strictEqual(extractText(undefined), '');

// A function-call reply: content is an array of parts, and JSON.stringify used to
// dump the whole thing into the chat bubble.
const withCall = [
    { type: 'text', text: 'The loop is off by one.' },
    { type: 'functionCall', functionCall: { name: 'apply_code_fix', args: {} } },
];
assert.strictEqual(extractText(withCall), 'The loop is off by one.');

// Thinking models surface reasoning parts that are not the answer.
assert.strictEqual(
    extractText([{ text: 'reasoning…', thought: true }, { text: 'Answer.' }]),
    'Answer.'
);

// The "[object Object]" case: parts with no text at all.
assert.strictEqual(extractText([{ functionCall: { name: 'x' } }]), '');
assert.strictEqual(extractText([{ type: 'text', text: 'a' }, 'b']), 'ab');
console.log('✓ extractText pulls prose out of every content shape');

// ── 2. friendlyError replaces the wall of Google quota JSON ──
const quota = new Error(
    '[GoogleGenerativeAI Error]: [429 Too Many Requests] You exceeded your current quota. Please retry in 52.688370872s. [{"@type":"...QuotaFailure"}]'
);
const friendlyQuota = friendlyError(quota);
assert.ok(!friendlyQuota.includes('@type'), 'raw quota JSON leaked to the user');
assert.ok(/53s/.test(friendlyQuota), `retry hint missing: ${friendlyQuota}`);

const retired = new Error('[404 Not Found] This model models/gemini-2.0-flash is no longer available.');
assert.ok(/not available/i.test(friendlyError(retired)));
assert.ok(/API key/i.test(friendlyError(new Error('403 permission denied on API key'))));
assert.strictEqual(friendlyError(new Error('socket hang up')), 'socket hang up');
console.log('✓ friendlyError summarises quota, retirement and auth failures');

// ── 3. Cooldown: a rate-limited model drops out of the chain ──
assert.deepStrictEqual(availableModels(), ['model-a', 'model-b', 'model-c']);

noteModelFailure('model-a', quota);
assert.deepStrictEqual(availableModels(), ['model-b', 'model-c'], 'model-a should be cooling down');
console.log('✓ a 429 removes that model from the next request\'s chain');

// A non-rate-limit failure must NOT sideline the model.
noteModelFailure('model-b', new Error('transient socket hang up'));
assert.deepStrictEqual(availableModels(), ['model-b', 'model-c'], 'non-429 must not trigger cooldown');
console.log('✓ a non-rate-limit error does not trigger a cooldown');

// ── 4. If everything is cooling down, still try rather than fail blind ──
noteModelFailure('model-b', quota);
noteModelFailure('model-c', quota);
assert.deepStrictEqual(
    availableModels(),
    ['model-a', 'model-b', 'model-c'],
    'with every model cooling down we must still attempt the full chain'
);
console.log('✓ full chain is still attempted when every model is cooling down');

// ── 5. A cooldown expires ──
const shortQuota = new Error('[429 Too Many Requests] quota. Please retry in 0.001s.');
noteModelFailure('model-a', shortQuota);
setTimeout(() => {
    assert.ok(availableModels().includes('model-a'), 'cooldown never expired');
    console.log('✓ cooldown expires and the model returns to the chain');
    console.log('\nAll fallback checks passed.');
}, 1100);
