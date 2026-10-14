import { HttpErrorResponse } from '@angular/common/http';

/** A readable message for a failed API call: the server's `{ "error": "…" }` text when it sent one. */
export function describeApiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return "Couldn't reach the server.";
    const body = error.error;
    if (body && typeof body === 'object' && typeof body.error === 'string') return body.error;
    if (typeof body === 'string' && body.trim()) return body;
    return `The server answered ${error.status} ${error.statusText}.`.trim();
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}
