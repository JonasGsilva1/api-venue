import axios from 'axios';

const defaultApiBaseUrl =
  import.meta.env.DEV || window.location.port === '3000'
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : window.location.origin;

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl;

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('@venue-intelligence:token');
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