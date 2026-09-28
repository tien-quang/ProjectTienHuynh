const FALLBACK_BACKEND_URL = import.meta.env.DEV
  ? 'http://localhost:5000'
  : 'https://chatbotrag-production-aba9.up.railway.app'

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || FALLBACK_BACKEND_URL
export const API_BASE_URL = `${BACKEND_URL}/api`
