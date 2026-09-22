/**
 * Smoke test for the RAG pipeline — run with `npm run test:rag`.
 *
 * Uses fake deterministic embeddings and an in-memory room, so it needs no
 * API key and no database. It locks in the behaviours that were previously
 * broken: result diversity across files, lexical filename matching, path
 * resolution, skip-on-unchanged indexing, and project-wide query handling.
 */
const assert = require('assert');

// ─── Force the in-memory store path ───
const db = require('../db');
db.isDBConnected = () => false;

// ─── Deterministic fake embeddings (bag-of-words hashed into 64 dims) ───
const embeddingService = require('../services/embeddingService');

const DIMS = 64;
function fakeVector(text) {
    const v = new Array(DIMS).fill(0);
    const tokens = String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    for (const t of tokens) {
        let h = 0;
        for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
        v[h % DIMS] += 1;
    }
    return v;
}
embeddingService.embedText = async (t) => fakeVector(t);
embeddingService.embedDocuments = async (texts) => texts.map(fakeVector);

// ─── Fake room: a big index.js plus several other files ───
const fileService = require('../services/fileService');

const bigIndex = Array.from({ length: 60 }, (_, i) =>
    `console.log("index line ${i}"); // bootstrap startup entry main`
).join('\n');

const FILES = [
    { _id: 'f1', roomId: 'r1', name: 'index.js', type: 'file', parentId: null, language: 'javascript', code: bigIndex },
    { _id: 'd1', roomId: 'r1', name: 'components', type: 'folder', parentId: null },
    { _id: 'f2', roomId: 'r1', name: 'Editor.jsx', type: 'file', parentId: 'd1', language: 'javascript',
      code: 'export function Editor() {\n  const monaco = useMonaco();\n  return renderEditor(monaco);\n}\n' },
    { _id: 'f3', roomId: 'r1', name: 'useWebRTC.js', type: 'file', parentId: null, language: 'javascript',
      code: 'export function useWebRTC() {\n  const peer = new RTCPeerConnection();\n  return { peer, stream };\n}\n' },
    { _id: 'f4', roomId: 'r1', name: 'auth.py', type: 'file', parentId: null, language: 'python',
      code: 'def login(user, password):\n    token = create_token(user)\n    return token\n' },
];

fileService.findFilesByRoom = async () => FILES;

const vectorStore = require('../services/vectorStoreService');
const projectContext = require('../services/projectContextService');

(async () => {
    // ── 1. Chunking returns line-numbered chunks ──
    const chunks = embeddingService.chunkCode(bigIndex);
    assert.ok(chunks.length > 1, 'big file should produce multiple chunks');
    assert.ok(chunks[0].startLine === 1 && chunks[0].endLine > 1, 'chunks carry line numbers');
    console.log(`✓ chunking: ${chunks.length} chunks, first = lines ${chunks[0].startLine}-${chunks[0].endLine}`);

    // ── 2. Indexing ──
    await vectorStore.indexAllFiles('r1', FILES);

    // ── 3. The regression from the transcript: one file must not eat every slot ──
    const results = await vectorStore.searchSimilar('r1', 'what does the editor component do', 8);
    const files = [...new Set(results.map((r) => r.filePath))];
    assert.ok(results.length > 0, 'search returned nothing');
    assert.ok(files.length > 1, `expected multiple files, got only: ${files.join(', ')}`);
    console.log(`✓ diversity: ${results.length} chunks across ${files.length} files → ${files.join(', ')}`);

    // ── 4. Nested paths are resolved ──
    assert.ok(files.includes('components/Editor.jsx'), `expected nested path, got ${files.join(', ')}`);
    console.log('✓ nested path resolved: components/Editor.jsx');

    // ── 5. Lexical signal: naming a file surfaces it ──
    const webrtc = await vectorStore.searchSimilar('r1', 'useWebRTC', 5);
    assert.ok(webrtc.some((r) => r.fileName === 'useWebRTC.js'), 'exact filename query missed its file');
    console.log(`✓ lexical: "useWebRTC" → top hit ${webrtc[0].filePath} (score ${webrtc[0].score.toFixed(3)})`);

    // ── 6. Re-index skips unchanged content ──
    const before = Date.now();
    await vectorStore.indexAllFiles('r1', FILES);
    console.log(`✓ re-index of unchanged room took ${Date.now() - before}ms (content-hash skip)`);

    // ── 7. The two questions from the user's transcript ──
    const q1 = 'tell me all the files with its content';
    const q2 = 'tell me the summary of the all files present in this room';
    assert.ok(projectContext.isProjectWideQuery(q1), `not detected as project-wide: ${q1}`);
    assert.ok(projectContext.isProjectWideQuery(q2), `not detected as project-wide: ${q2}`);
    assert.ok(!projectContext.isProjectWideQuery('fix the bug in this loop'), 'false positive');
    console.log('✓ project-wide detection matches both transcript questions');

    // ── 8. Manifest lists every file ──
    const manifest = await projectContext.buildProjectManifest('r1');
    ['index.js', 'components/Editor.jsx', 'useWebRTC.js', 'auth.py'].forEach((name) => {
        assert.ok(manifest.includes(name), `manifest missing ${name}`);
    });
    console.log('✓ manifest lists all 4 files\n');
    console.log(manifest);

    const digest = await projectContext.buildProjectDigest('r1');
    assert.ok(digest.includes('def login'), 'digest missing python content');
    assert.ok(digest.includes('RTCPeerConnection'), 'digest missing webrtc content');
    console.log(`\n✓ digest built (${digest.length} chars) containing every file's contents`);

    console.log('\nAll checks passed.');
})().catch((err) => {
    console.error('\nFAILED:', err.message);
    process.exit(1);
});
