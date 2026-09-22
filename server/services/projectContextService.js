const fileService = require('./fileService');

// ─── Configuration ───
const DIGEST_CHAR_BUDGET = 24000;
const DIGEST_PER_FILE_CHARS = 4000;

/**
 * Questions about the project as a whole ("what files are here", "summarise the
 * codebase", "how does it all fit together"). Similarity search cannot answer
 * these — top-K retrieval returns fragments, never an inventory — so they get
 * the full file manifest plus as much file content as the budget allows.
 */
const PROJECT_WIDE_PATTERNS = [
    /\b(all|every|each)\b.{0,20}\b(file|files|module|modules|component|components)\b/i,
    /\b(file|files)\b.{0,20}\b(present|exist|available|in (this|the) (room|project|repo|codebase))\b/i,
    /\b(list|show|tell me|give me|what are)\b.{0,30}\b(files?|structure|tree|folders?|directories)\b/i,
    /\b(project|codebase|repo|repository|app)\b.{0,25}\b(structure|overview|summary|architecture|organi[sz]ation)\b/i,
    /\b(summar(y|ise|ize)|overview|explain)\b.{0,25}\b(project|codebase|repo|repository|everything|whole)\b/i,
    /\bhow (does|do) (this|the|it) (project|codebase|app|repo|thing) work\b/i,
    /\bwhat (does|is) (this|the) (project|codebase|app|repo)\b/i,
];

function isProjectWideQuery(query) {
    if (!query || typeof query !== 'string') return false;
    return PROJECT_WIDE_PATTERNS.some((pattern) => pattern.test(query));
}

function toId(value) {
    if (value === null || value === undefined) return null;
    return value.toString ? value.toString() : String(value);
}

/**
 * Resolve each file's full path by walking parentId links.
 * Returns a Map of fileId -> "folder/sub/name.js".
 */
function buildPathMap(files) {
    const byId = new Map();
    files.forEach((file) => byId.set(toId(file._id), file));

    const paths = new Map();

    const resolve = (file, seen) => {
        const id = toId(file._id);
        if (paths.has(id)) return paths.get(id);

        // Guard against a corrupted parent cycle rather than recursing forever.
        if (seen.has(id)) return file.name;
        seen.add(id);

        const parentId = toId(file.parentId);
        const parent = parentId ? byId.get(parentId) : null;
        const path = parent ? `${resolve(parent, seen)}/${file.name}` : file.name;

        paths.set(id, path);
        return path;
    };

    files.forEach((file) => resolve(file, new Set()));
    return paths;
}

function countLines(code) {
    if (!code) return 0;
    return code.split('\n').length;
}

/**
 * A compact inventory of every file in the room. Cheap enough (a few hundred
 * tokens) to attach to every request, which is what makes the assistant stop
 * claiming it can only see one file.
 */
async function buildProjectManifest(roomId) {
    if (!roomId) return '';

    let files;
    try {
        files = await fileService.findFilesByRoom(roomId);
    } catch (error) {
        console.warn('Manifest build failed:', error.message);
        return '';
    }

    if (!Array.isArray(files) || files.length === 0) return '';

    const paths = buildPathMap(files);
    const actualFiles = files.filter((file) => file.type === 'file');

    if (actualFiles.length === 0) return '';

    const entries = actualFiles
        .map((file) => {
            const path = paths.get(toId(file._id)) || file.name;
            const lines = countLines(file.code);
            const language = file.language || 'unknown';
            const empty = !file.code || file.code.trim() === '';
            return `- ${path} — ${language}, ${lines} line${lines === 1 ? '' : 's'}${empty ? ' (empty)' : ''}`;
        })
        .sort((a, b) => a.localeCompare(b));

    return [
        `### Files in this project (${actualFiles.length} total)`,
        '',
        ...entries,
        '',
        'This list is complete. If the user asks what files exist, answer from this list.',
    ].join('\n');
}

/**
 * Full (or budget-truncated) contents of every file, for project-wide questions.
 */
async function buildProjectDigest(roomId, charBudget = DIGEST_CHAR_BUDGET) {
    if (!roomId) return '';

    let files;
    try {
        files = await fileService.findFilesByRoom(roomId);
    } catch (error) {
        console.warn('Digest build failed:', error.message);
        return '';
    }

    if (!Array.isArray(files) || files.length === 0) return '';

    const paths = buildPathMap(files);
    const actualFiles = files
        .filter((file) => file.type === 'file' && file.code && file.code.trim() !== '')
        .sort((a, b) => (a.code || '').length - (b.code || '').length);

    if (actualFiles.length === 0) return '';

    // Smallest files first so a single huge file cannot starve the rest.
    const perFileBudget = Math.max(
        600,
        Math.min(DIGEST_PER_FILE_CHARS, Math.floor(charBudget / actualFiles.length))
    );

    const sections = [];
    let used = 0;
    let omitted = 0;

    for (const file of actualFiles) {
        const path = paths.get(toId(file._id)) || file.name;
        const code = file.code;
        const truncated = code.length > perFileBudget;
        const body = truncated
            ? `${code.slice(0, perFileBudget)}\n// … truncated (${code.length - perFileBudget} more characters)`
            : code;

        const section = `**${path}** (${file.language || 'unknown'}):\n\`\`\`${file.language || ''}\n${body}\n\`\`\``;

        if (used + section.length > charBudget) {
            omitted += 1;
            continue;
        }

        sections.push(section);
        used += section.length;
    }

    if (sections.length === 0) return '';

    const footer = omitted > 0
        ? `\n_${omitted} further file(s) omitted for length — ask about them by name._`
        : '';

    return `### Contents of every file in this project\n\n${sections.join('\n\n')}${footer}`;
}

module.exports = {
    isProjectWideQuery,
    buildProjectManifest,
    buildProjectDigest,
    buildPathMap,
};
