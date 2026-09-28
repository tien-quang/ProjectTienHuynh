import { createContext, useContext } from 'react'
import useAuthStore from '../store/authStore'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const store = useAuthStore()
  const value = {
    user: store.user,
    setUser: store.setUser,
    login: store.login,
    register: store.register,
    logout: store.logout,
    isAuthenticated: store.isAuthenticated,
    isMasterAdmin: store.user?.role === 'master_admin',
    isManager: store.user?.role === 'manager' || store.user?.role === 'master_admin',
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
