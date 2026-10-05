const FALLBACK_BACKEND_URL = import.meta.env.DEV ? 'http://localhost:5000' : ''

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL
  || import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, '')
  || FALLBACK_BACKEND_URL
export const API_BASE_URL = `${BACKEND_URL}/api`
