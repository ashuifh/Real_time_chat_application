const configuredApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
export const API_URL = configuredApiUrl.replace(/\/$/, '');
const TOKEN_KEY = 'chatt.auth.token';

export const authStore = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
  },
};

export async function apiRequest(path, { method = 'GET', body, token = authStore.getToken(), signal } = {}) {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (body && !(body instanceof FormData)) headers.set('Content-Type', 'application/json');

  let response;
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      method,
      headers,
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error(`Cannot reach the Chatt server at ${API_URL}. Check that the backend is running.`);
  }

  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = payload.details?.fieldErrors;
    const fieldMessage = details && Object.entries(details)
      .flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`))[0];
    throw new Error(fieldMessage || payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

let socketScriptPromise;

export function loadSocketClient() {
  if (window.io) return Promise.resolve(window.io);
  if (socketScriptPromise) return socketScriptPromise;

  socketScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-chatt-socket-client]');
    const script = existingScript || document.createElement('script');
    const fail = () => {
      socketScriptPromise = null;
      reject(new Error('Could not load the realtime client from the backend.'));
    };
    script.addEventListener('load', () => window.io ? resolve(window.io) : fail(), { once: true });
    script.addEventListener('error', fail, { once: true });
    if (!existingScript) {
      script.src = `${API_URL}/socket.io/socket.io.js`;
      script.dataset.chattSocketClient = 'true';
      document.head.append(script);
    }
  });

  return socketScriptPromise;
}
