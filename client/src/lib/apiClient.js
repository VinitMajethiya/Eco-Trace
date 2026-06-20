export const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Custom fetch wrapper that prepends the API base URL for relative paths starting with /api
 * and automatically attaches credentials (cookies) to support cross-origin requests.
 * 
 * @param {string|Request} input 
 * @param {object} init 
 * @returns {Promise<Response>}
 */
export function apiFetch(input, init = {}) {
  let url = input;
  if (typeof input === 'string' && input.startsWith('/api')) {
    url = `${API_BASE}${input}`;
  }

  const mergedInit = {
    ...init,
    credentials: 'include'
  };

  return fetch(url, mergedInit);
}
