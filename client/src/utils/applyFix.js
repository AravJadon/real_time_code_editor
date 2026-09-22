/**
 * Merge an AI-proposed fix into a file's current contents.
 *
 * The model returns `newCode` as the replacement for `oldCode` — a *snippet*, not
 * the whole file. Writing it straight over the buffer deletes everything else in
 * the file, which is what the Apply Fix button used to do whenever the model
 * answered with a one-line change.
 *
 * Kept as a pure function so the merge rules can be tested without a browser.
 *
 * @returns {{ ok: true, code: string } | { ok: false, reason: string }}
 */
export function mergeFix(currentCode, fix) {
    if (!fix || !fix.newCode) {
        return { ok: false, reason: 'empty-fix' };
    }

    const current = typeof currentCode === 'string' ? currentCode : '';
    const { oldCode, newCode } = fix;

    // Normal case: anchor found, splice the snippet in place.
    if (oldCode && current.includes(oldCode)) {
        const merged = current.replace(oldCode, newCode);
        return merged === current
            ? { ok: false, reason: 'already-applied' }
            : { ok: true, code: merged };
    }

    // Anchor given but missing from the file. If the replacement is a fragment,
    // applying it wholesale would destroy the file — refuse rather than guess.
    if (oldCode && current.trim() && !/\r?\n/.test(newCode)) {
        return { ok: false, reason: 'anchor-not-found' };
    }

    // No anchor, or the model rewrote the whole file: replace outright.
    return newCode === current
        ? { ok: false, reason: 'already-applied' }
        : { ok: true, code: newCode };
}

/**
 * Find the file a fix targets. The model cites files however they appeared in its
 * context, which may be a path ("services/api.js") when the tab is just "api.js".
 */
export function findFixTarget(files, fileName, activeFile) {
    if (!fileName) return activeFile || null;

    const base = (value) => String(value || '').split('/').pop();

    return (
        (files || []).find(
            (f) =>
                f.type === 'file' &&
                (f.name === fileName || base(f.name) === base(fileName))
        ) || null
    );
}
