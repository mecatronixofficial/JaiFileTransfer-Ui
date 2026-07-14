import axios from 'axios';
import { showToast } from './toast';

const HTTP_MESSAGES: Record<number, string> = {
  400: 'Bad request — please check your input.',
  401: 'Session expired. Please sign in again.',
  403: 'You don\'t have permission to do that.',
  404: 'The requested resource was not found.',
  408: 'Request timed out. Please try again.',
  409: 'A conflict occurred. The action may already be complete.',
  413: 'File too large. Please try a smaller file.',
  422: 'Validation failed. Please check your input.',
  429: 'Too many requests. Please slow down.',
  500: 'Server error. Please try again later.',
  502: 'Bad gateway. Please try again later.',
  503: 'Service unavailable. Please try again later.',
  504: 'Gateway timeout. Please try again later.',
};

/** Extract a human-readable message without showing a toast. */
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      return isOffline
        ? 'You appear to be offline. Check your connection.'
        : 'Network error. Please check your connection and try again.';
    }

    const { data, status } = err.response as {
      status: number;
      data?: { message?: string; error?: string; errors?: string[] };
    };

    if (data?.errors?.length) return data.errors[0];
    if (data?.message) return data.message;
    if (data?.error) return data.error;
    if (HTTP_MESSAGES[status]) return HTTP_MESSAGES[status];
  }

  return 'Something went wrong. Please try again.';
}

/** Extract a human-readable message and show an error toast (unless silent). */
export function handleApiError(err: unknown, silent = false): string {
  const msg = getErrorMessage(err);
  if (!silent) showToast.error(msg);
  return msg;
}