const http = require('http');
const https = require('https');
const SUPPORTED_LANGUAGES = require('../languages');

const JUDGE0_DEFAULT_API_URL = 'https://ce.judge0.com';
const JUDGE0_FIELDS = 'stdout,stderr,compile_output,message,status,time,memory';

function readNumberEnv(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

const JUDGE0_POLL_INTERVAL_MS = readNumberEnv('JUDGE0_POLL_INTERVAL_MS', 800);
const JUDGE0_MAX_POLL_ATTEMPTS = readNumberEnv('JUDGE0_MAX_POLL_ATTEMPTS', 15);

function getJudge0Config() {
    const apiUrl = (process.env.JUDGE0_API_URL || JUDGE0_DEFAULT_API_URL).replace(/\/+$/, '');
    const apiHost = process.env.JUDGE0_API_HOST || new URL(apiUrl).host;
    const apiKey = process.env.JUDGE0_API_KEY || process.env.RAPIDAPI_KEY;
    const usesRapidApi = apiHost.includes('rapidapi.com') || apiUrl.includes('rapidapi.com');

    return {
        apiUrl,
        apiHost,
        apiKey,
        usesRapidApi,
        authToken: process.env.JUDGE0_AUTH_TOKEN,
        authUser: process.env.JUDGE0_AUTH_USER,
    };
}

function createJudge0Headers(payload) {
    const config = getJudge0Config();
    const headers = {
        'Content-Type': 'application/json',
    };

    if (payload) {
        headers['Content-Length'] = Buffer.byteLength(payload);
    }

    if (config.apiKey) {
        headers['X-RapidAPI-Key'] = config.apiKey;
        headers['X-RapidAPI-Host'] = config.apiHost;
    }

    if (config.authToken) {
        headers['X-Auth-Token'] = config.authToken;
    }

    if (config.authUser) {
        headers['X-Auth-User'] = config.authUser;
    }

    return headers;
}

function ensureJudge0IsConfigured() {
    const config = getJudge0Config();

    if (config.usesRapidApi && !config.apiKey) {
        const error = new Error(
            'Judge0 is using RapidAPI. Add JUDGE0_API_KEY to real_time_code_editor/.env and restart the server.'
        );
        error.statusCode = 500;
        throw error;
    }
}

function encodeBase64(value) {
    return Buffer.from(value || '', 'utf8').toString('base64');
}

function decodeBase64(value) {
    if (!value) return '';
    return Buffer.from(value, 'base64').toString('utf8');
}

function requestJudge0(method, endpoint, body) {
    const config = getJudge0Config();
    const url = new URL(endpoint, `${config.apiUrl}/`);
    const payload = body ? JSON.stringify(body) : '';
    const transport = url.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
        const request = transport.request(
            url,
            {
                method,
                headers: createJudge0Headers(payload),
            },
            (response) => {
                let rawData = '';

                response.setEncoding('utf8');
                response.on('data', (chunk) => {
                    rawData += chunk;
                });
                response.on('end', () => {
                    let data;

                    try {
                        data = rawData ? JSON.parse(rawData) : {};
                    } catch (parseError) {
                        data = {
                            error:
                                rawData ||
                                `Judge0 returned a non-JSON response (${parseError.message}).`,
                        };
                    }

                    resolve({
                        ok: response.statusCode >= 200 && response.statusCode < 300,
                        statusCode: response.statusCode,
                        data,
                    });
                });
            }
        );

        request.setTimeout(20000, () => {
            request.destroy(new Error('Judge0 request timed out.'));
        });

        request.on('error', reject);

        if (payload) {
            request.write(payload);
        }

        request.end();
    });
}

function formatJudge0Error(response) {
    const data = response.data;
    const statusCode = response.statusCode;

    if (typeof data.error === 'string') return data.error;
    if (Array.isArray(data.error)) return data.error.join(', ');

    const validationErrors = Object.entries(data)
        .map(([field, value]) => {
            if (Array.isArray(value)) return `${field}: ${value.join(', ')}`;
            if (typeof value === 'string') return `${field}: ${value}`;
            return null;
        })
        .filter(Boolean);

    if (validationErrors.length > 0) {
        return validationErrors.join('\n');
    }

    return `Judge0 request failed with status ${statusCode}.`;
}

async function createSubmission(code, language, stdin) {
    const response = await requestJudge0('POST', '/submissions/?base64_encoded=true&wait=false', {
        source_code: encodeBase64(code),
        language_id: language.id,
        stdin: encodeBase64(stdin),
        cpu_time_limit: readNumberEnv('JUDGE0_CPU_TIME_LIMIT', 5),
        wall_time_limit: readNumberEnv('JUDGE0_WALL_TIME_LIMIT', 10),
        memory_limit: readNumberEnv('JUDGE0_MEMORY_LIMIT', 128000),
    });

    if (!response.ok) {
        throw new Error(formatJudge0Error(response));
    }

    if (!response.data.token) {
        throw new Error('Judge0 did not return a submission token.');
    }

    return response.data.token;
}

async function getSubmission(token) {
    const response = await requestJudge0(
        'GET',
        `/submissions/${token}?base64_encoded=true&fields=${JUDGE0_FIELDS}`
    );

    if (!response.ok) {
        throw new Error(formatJudge0Error(response));
    }

    return response.data;
}

function wait(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function waitForSubmission(token) {
    for (let attempt = 0; attempt < JUDGE0_MAX_POLL_ATTEMPTS; attempt += 1) {
        const submission = await getSubmission(token);
        const statusId = submission.status && submission.status.id;

        if (statusId && statusId > 2) {
            return submission;
        }

        await wait(JUDGE0_POLL_INTERVAL_MS);
    }

    throw new Error('Judge0 is still processing the submission. Try running again.');
}

async function runCode(code, languageKey, stdin) {
    const language = SUPPORTED_LANGUAGES[languageKey];

    if (!language) {
        const error = new Error(`Unsupported language: ${languageKey}`);
        error.statusCode = 400;
        throw error;
    }

    ensureJudge0IsConfigured();

    const input = typeof stdin === 'string' ? stdin : String(stdin || '');
    const token = await createSubmission(code, language, input);
    const submission = await waitForSubmission(token);

    const output = decodeBase64(submission.stdout);
    const compileOutput = decodeBase64(submission.compile_output);
    const stderr = decodeBase64(submission.stderr);
    const message = decodeBase64(submission.message);
    const status = (submission.status && submission.status.description) || 'Unknown';
    let error = [compileOutput, stderr, message].filter(Boolean).join('\n');

    if (submission.status && submission.status.id !== 3 && !error) {
        error = status;
    }

    return {
        output,
        error,
        status,
        time: submission.time,
        memory: submission.memory,
        language: language.label,
    };
}

module.exports = {
    runCode,
};
