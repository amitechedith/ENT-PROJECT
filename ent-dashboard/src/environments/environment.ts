const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export const environment = {
    production: false,
    apiUrl: isLocalhost ? 'http://localhost:3000/api' : `${window.location.protocol}//${window.location.hostname}:3000/api`
};
