import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  MessageSquare, LayoutDashboard, Users, BookOpen, ShoppingBag,
  ClipboardList, Building2, LogOut, Bot, Menu, X, ChevronLeft,
  ChevronRight, User
} from 'lucide-react'
import useAuthStore from '../../store/authStore'
import NotificationBell from './NotificationBell'
import clsx from 'clsx'

const navItems = [
  { to: '/chat', icon: MessageSquare, label: 'Chat AI', roles: ['employee','manager','master_admin'] },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['manager','master_admin'] },
  { to: '/users', icon: Users, label: 'Người dùng', roles: ['manager','master_admin'] },
  { to: '/departments', icon: Building2, label: 'Phòng ban', roles: ['manager','master_admin'] },
  { to: '/knowledge', icon: BookOpen, label: 'Tài liệu nội bộ', roles: ['employee','manager','master_admin'] },
  { to: '/products', icon: ShoppingBag, label: 'Sản phẩm', roles: ['employee','manager','master_admin'] },
  { to: '/audit', icon: ClipboardList, label: 'Audit Log', roles: ['master_admin'] },
]

const ROLE_LABEL = { master_admin: 'Master Admin', manager: 'Quản lý', employee: 'Nhân viên' }
const ROLE_COLOR = {
  master_admin: 'text-amber-400 bg-amber-400/10 border border-amber-400/20',
  manager: 'text-blue-400 bg-blue-400/10 border border-blue-400/20',
  employee: 'text-slate-400 bg-slate-400/10 border border-slate-400/20',
}

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const visible = navItems.filter(n => n.roles.includes(user?.role))
  const handleLogout = async () => { await logout(); navigate('/login') }
  const avatar = user?.name?.[0]?.toUpperCase() || 'U'

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={clsx('flex items-center gap-3 px-4 py-5 border-b border-slate-800/60', collapsed && 'justify-center px-3')}>
        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30 flex-shrink-0">
          <Bot size={18} className="text-white" />
        </div>
        {!collapsed && (
          <div>
            <div className="font-bold text-white text-sm leading-tight">TTTN Chatbot</div>
            <div className="text-xs text-slate-500">Hệ thống nội bộ</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {visible.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} onClick={() => setMobileOpen(false)}
            className={({ isActive }) => clsx('nav-link', isActive && 'active', collapsed && 'justify-center px-2')}>
            <Icon size={17} className="flex-shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className={clsx('border-t border-slate-800/60 p-3', collapsed && 'flex justify-center')}>
        {!collapsed ? (
          <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-800 cursor-pointer transition-all group"
            onClick={() => navigate('/profile')}>
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {avatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate leading-tight">{user?.name}</p>
              <span className={clsx('badge text-xs mt-0.5', ROLE_COLOR[user?.role])}>{ROLE_LABEL[user?.role]}</span>
            </div>
            <button onClick={e => { e.stopPropagation(); handleLogout() }}
              className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button onClick={handleLogout} className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
            <LogOut size={16} />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0a0f1e' }}>
      {/* Desktop sidebar */}
      <aside className={clsx(
        'hidden md:flex flex-col border-r border-slate-800/60 transition-all duration-300 relative flex-shrink-0',
        collapsed ? 'w-16' : 'w-60'
      )} style={{ background: '#0d1424' }}>
        <SidebarContent />
        <button onClick={() => setCollapsed(c => !c)}
          className="absolute -right-3 top-20 w-6 h-6 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 z-10 transition-all">
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 flex flex-col border-r border-slate-800/60 z-10" style={{ background: '#0d1424' }}>
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white">
              <X size={18} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60 flex-shrink-0" style={{ background: '#0d1424' }}>
          <button className="md:hidden text-slate-400 hover:text-white transition-colors" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>
          <span className="text-slate-500 text-xs hidden md:flex items-center gap-1.5">
            {user?.department?.name ? `📌 ${user.department.name}` : '🌐 Toàn hệ thống'}
          </span>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <NavLink to="/profile"
              className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20">
              {avatar}
            </NavLink>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
