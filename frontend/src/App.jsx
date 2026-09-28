import { Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from './store/authStore'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import Layout from './components/layout/Layout'
import ChatPage from './pages/chat/ChatPage'
import DashboardPage from './pages/admin/DashboardPage'
import UsersPage from './pages/admin/UsersPage'
import DepartmentsPage from './pages/admin/DepartmentsPage'
import AuditPage from './pages/admin/AuditPage'
import KnowledgePage from './pages/knowledge/KnowledgePage'
import ProductsPage from './pages/products/ProductsPage'
import ProfilePage from './pages/auth/ProfilePage'

function PrivateRoute({ children, roles }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user?.role)) return <Navigate to="/chat" replace />
  return children
}

export default function App() {
  const { isAuthenticated } = useAuthStore()
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/chat" replace /> : <LoginPage />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/chat" replace /> : <RegisterPage />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/chat" replace />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="chat/:sessionId" element={<ChatPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="dashboard" element={<PrivateRoute roles={['master_admin','manager']}><DashboardPage /></PrivateRoute>} />
        <Route path="users" element={<PrivateRoute roles={['master_admin','manager']}><UsersPage /></PrivateRoute>} />
        <Route path="departments" element={<PrivateRoute roles={['master_admin','manager']}><DepartmentsPage /></PrivateRoute>} />
        <Route path="audit" element={<PrivateRoute roles={['master_admin']}><AuditPage /></PrivateRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  )
}
