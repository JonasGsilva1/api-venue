import axios from 'axios';

// Origem da API:
// 1. VITE_API_BASE_URL, quando definida (API hospedada em outro domínio);
// 2. em desenvolvimento (Vite em 5173/3000) a API FastAPI local, na porta 8000;
// 3. caso contrário, a mesma origem da página: no Render o FastAPI serve o front e a API na mesma URL.
function resolverBaseUrl(): string {
  const configurada = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (configurada) return configurada.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && ['5173', '3000'].includes(window.location.port)) {
    return 'http://localhost:8000';
  }
  return '';
}

export const api = axios.create({
  baseURL: resolverBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token =
    localStorage.getItem('@venue-intelligence:token') ||
    (import.meta.env.VITE_API_TOKEN as string | undefined) ||
    'dev-raiz-token-2026';
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('@venue-intelligence:token');
      localStorage.removeItem('@venue-intelligence:user');
    }
    return Promise.reject(error);
  }
);
