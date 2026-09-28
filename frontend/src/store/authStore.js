import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import axios from 'axios'
import { API_BASE_URL } from '../services/config'

const BASE_URL = API_BASE_URL

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: async (email, password) => {
        const { data } = await axios.post(`${BASE_URL}/auth/login`, { email, password })
        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isAuthenticated: true,
        })
        return data.user
      },

      register: async (name, email, password, departmentId) => {
        const { data } = await axios.post(`${BASE_URL}/auth/register`, {
          name, email, password,
          ...(departmentId ? { departmentId } : {})
        })
        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isAuthenticated: true,
        })
        return data.user
      },

      logout: async () => {
        const { refreshToken, accessToken } = get()
        try {
          await axios.post(`${BASE_URL}/auth/logout`, { refreshToken },
            { headers: { Authorization: `Bearer ${accessToken}` } })
        } catch (_) {}
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
      },

      setUser: (updater) => {
        const current = get().user
        set({ user: typeof updater === 'function' ? updater(current) : updater })
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get()
        if (!refreshToken) throw new Error('No refresh token')
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken })
        set({ accessToken: data.accessToken, refreshToken: data.refreshToken })
        return data.accessToken
      },
    }),
    {
      name: 'tttn-auth',
      // sessionStorage: mỗi tab/cửa sổ trình duyệt có session riêng biệt
      // Tab 1 đăng nhập Admin, Tab 2 đăng nhập Manager → không xung đột
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        isAuthenticated: s.isAuthenticated,
      }),
    }
  )
)

export default useAuthStore
