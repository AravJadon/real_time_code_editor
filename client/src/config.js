const isLocalhostClient =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

const configuredBackendUrl = process.env.REACT_APP_BACKEND_URL;
const configuredBackendIsLocalhost =
    configuredBackendUrl &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(configuredBackendUrl);

export const BACKEND_URL =
    !configuredBackendUrl || (!isLocalhostClient && configuredBackendIsLocalhost)
        ? `${window.location.protocol}//${window.location.hostname}:5000`
        : configuredBackendUrl;
