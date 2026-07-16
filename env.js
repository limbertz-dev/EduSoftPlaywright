const fs = require('fs');
const path = require('path');

function parseEnvValue(value) {
    const trimmed = value.trim();
    const quote = trimmed[0];
    if ((quote === '"' || quote === "'") && trimmed[trimmed.length - 1] === quote) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function loadEnv(filePath = path.join(__dirname, '.env')) {
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;

        const key = trimmed.slice(0, eqIdx).trim();
        const value = parseEnvValue(trimmed.slice(eqIdx + 1));

        if (key && process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

module.exports = { loadEnv };
