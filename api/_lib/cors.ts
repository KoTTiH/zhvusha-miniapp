/**
 * CORS headers for browser calls during dev (Vite on localhost).
 * Production same-origin won't need them, but they don't hurt.
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-init-data',
}
