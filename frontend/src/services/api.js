import axios from 'axios'
import { API_BASE_URL } from './config'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
})

// Zustand persist với sessionStorage lưu dạng: { state: { accessToken, ... }, version: 0 }
function getState() {
  try {
    const raw = sessionStorage.getItem('tttn-auth')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed?.state || parsed || {}
  } catch { return {} }
}

api.interceptors.request.use((config) => {
  const { accessToken } = getState()
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && err.response?.data?.code === 'TOKEN_EXPIRED' && !original._retry) {
      original._retry = true
      try {
        const state = getState()
        const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, {
          refreshToken: state.refreshToken
        })
        // Update sessionStorage
        const raw = sessionStorage.getItem('tttn-auth')
        const parsed = raw ? JSON.parse(raw) : { state: {} }
        parsed.state = { ...parsed.state, accessToken: data.accessToken, refreshToken: data.refreshToken }
        sessionStorage.setItem('tttn-auth', JSON.stringify(parsed))
        original.headers.Authorization = `Bearer ${data.accessToken}`
        return api(original)
      } catch {
        sessionStorage.removeItem('tttn-auth')
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api
