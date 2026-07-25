import axios, { AxiosError } from 'axios';

export interface ApiErrorDetails {
  status?: number;
  code?: string;
  error: string;
  retryable: boolean;
  payload?: unknown;
}

export class ApiError extends Error {
  status?: number;
  code?: string;
  retryable: boolean;
  payload?: unknown;

  constructor(details: ApiErrorDetails) {
    super(details.error);
    this.name = 'ApiError';
    this.status = details.status;
    this.code = details.code;
    this.retryable = details.retryable;
    this.payload = details.payload;
  }
}

function normalizeMessage(status?: number, message?: string) {
  if (status === 401) return 'You are not authorized to perform this action.';
  if (status === 404) return 'The requested resource was not found.';
  if (status === 408 || status === 504) return 'The request timed out. Try again.';
  if (status === 429) return 'The backend is rate limiting requests. Please retry shortly.';
  if (status && status >= 500) return 'The backend is temporarily unavailable.';
  return message || 'An unexpected error occurred.';
}

function normalizeAxiosError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: string; message?: string }>;
    const status = axiosError.response?.status;
    const backendMessage = axiosError.response?.data?.error ?? axiosError.response?.data?.message;
    const fallback = axiosError.code === 'ECONNABORTED' ? 'Request timed out.' : axiosError.message;
    return new ApiError({
      status,
      code: axiosError.code,
      error: normalizeMessage(status, backendMessage ?? fallback),
      retryable: !status || status >= 500 || status === 408 || status === 429,
      payload: axiosError.response?.data,
    });
  }
  if (error instanceof Error) {
    return new ApiError({ error: error.message, retryable: true });
  }
  return new ApiError({ error: 'An unexpected error occurred.', retryable: true });
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000';

export const http = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 15000,
});

http.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(normalizeAxiosError(error)),
);

http.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(normalizeAxiosError(error)),
);
