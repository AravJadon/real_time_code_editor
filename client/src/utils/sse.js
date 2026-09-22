/**
 * Incremental Server-Sent Events parser.
 *
 * A single SSE event is not guaranteed to arrive in one network chunk. Splitting
 * each chunk on "\n" in isolation — which is what the AI panel used to do — drops
 * every event that happens to straddle a boundary, so long answers lost words at
 * random. Anything incomplete has to stay buffered until the rest arrives.
 *
 * Usage:
 *   const parser = createSSEParser((event) => { ... });
 *   parser.push(decoder.decode(value, { stream: true }));
 *   parser.flush();
 */
export function createSSEParser(onEvent) {
    let buffer = '';

    const handleLine = (rawLine) => {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) return;

        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') return;

        let parsed;
        try {
            parsed = JSON.parse(data);
        } catch {
            return; // genuinely malformed event — skip it, keep the stream alive
        }

        onEvent(parsed);
    };

    return {
        push(text) {
            if (!text) return;
            buffer += text;

            const lines = buffer.split('\n');
            // The final element may be a partial line; hold it back for the next push.
            buffer = lines.pop() ?? '';

            lines.forEach(handleLine);
        },

        flush() {
            if (!buffer) return;
            const remaining = buffer;
            buffer = '';
            handleLine(remaining);
        },
    };
}
