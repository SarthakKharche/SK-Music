import axios from 'axios';

export const DEFAULT_SERVER_URL = 'https://impenetrably-unclean-alayah.ngrok-free.dev/api';
const API_URL = import.meta.env.VITE_API_URL || DEFAULT_SERVER_URL;

/**
 * Axios instance with default configuration
 */
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 15000, // 15 second timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor to add auth token
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Response interceptor for error handling
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Log error cleanly without nuking local storage
    if (error.response?.status === 401) {
      console.warn('[API Interceptor] 401 Unauthorized encountered for URL:', error.config?.url);
    }
    return Promise.reject(error);
  }
);

export default api;
