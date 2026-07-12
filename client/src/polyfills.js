const nodeEnv =
    typeof process !== 'undefined' && process.env?.NODE_ENV
        ? process.env.NODE_ENV
        : 'development';

const nextTick = (callback, ...args) => {
    Promise.resolve().then(() => callback(...args));
};

const browserProcess = {
    env: {
        NODE_ENV: nodeEnv,
    },
    browser: true,
    nextTick,
    emitWarning: () => {},
    stdout: null,
    stderr: null,
};

const browserGlobal = typeof window !== 'undefined' ? window : {};

if (!browserGlobal.process) {
    browserGlobal.process = browserProcess;
}

if (!browserGlobal.global) {
    browserGlobal.global = browserGlobal;
}
