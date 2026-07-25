import { ApiError } from '@/services/http';

export function normalizeApiError(error: unknown) {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) return new ApiError({ error: error.message, retryable: true });
  return new ApiError({ error: 'An unexpected error occurred.', retryable: true });
}

export function apiErrorToMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}

