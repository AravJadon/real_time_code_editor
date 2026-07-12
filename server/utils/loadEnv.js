const fs = require('fs');

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return;

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)$/);
        if (!match) return;

        const key = match[1];
        let value = match[2].trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    });
}

module.exports = loadEnvFile;
