import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showDemo, setShowDemo] = useState(false)

  const DEMO_ACCOUNTS = [
    { label: 'Master Admin',  email: 'admin@tttn.vn',         pass: 'Admin@123456', color: 'border-amber-600/40 text-amber-300 hover:bg-amber-600/10' },
    { label: 'HR Manager',    email: 'hr.manager@tttn.vn',    pass: 'Manager@123',  color: 'border-blue-600/40 text-blue-300 hover:bg-blue-600/10' },
    { label: 'IT Manager',    email: 'it.manager@tttn.vn',    pass: 'Manager@123',  color: 'border-purple-600/40 text-purple-300 hover:bg-purple-600/10' },
    { label: 'Sales Manager', email: 'sales.manager@tttn.vn', pass: 'Manager@123',  color: 'border-green-600/40 text-green-300 hover:bg-green-600/10' },
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.email || !form.password) { toast.error('Vui lòng điền đầy đủ'); return }
    setLoading(true)
    try {
      await login(form.email.trim(), form.password)
      navigate('/chat')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Email hoặc mật khẩu không đúng')
    } finally { setLoading(false) }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: 'radial-gradient(ellipse at 30% 40%, #0d3d38 0%, #0a2e2a 30%, #071a17 60%, #050f0e 100%)',
      }}
    >
      {/* Card */}
      <div
        className="w-full max-w-[400px] mx-4 rounded-2xl px-8 py-9"
        style={{
          background: '#111b19',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Title */}
        <h1 className="text-2xl font-extrabold text-white mb-6 tracking-tight">
          Đăng nhập Chatbot
        </h1>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Username</label>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="ten@congty.vn"
              className="w-full px-4 py-3 rounded-xl text-sm text-slate-700 placeholder-slate-400 outline-none transition-all"
              style={{ background: '#e8f0ee', border: '2px solid transparent' }}
              onFocus={e => { e.target.style.borderColor = '#22c55e'; e.target.style.background = '#fff' }}
              onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = '#e8f0ee' }}
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Mật khẩu</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                className="w-full px-4 py-3 pr-11 rounded-xl text-sm text-slate-700 placeholder-slate-400 outline-none transition-all"
                style={{ background: '#e8f0ee', border: '2px solid transparent' }}
                onFocus={e => { e.target.style.borderColor = '#22c55e'; e.target.style.background = '#fff' }}
                onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = '#e8f0ee' }}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
          >
            {loading
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <><LogIn size={15} /> Đăng nhập</>}
          </button>
        </form>

        {/* Register */}
        <p className="text-sm text-slate-400 mt-4">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="font-bold text-white hover:text-green-400 transition-colors">
            Đăng ký
          </Link>
        </p>

        {/* Demo toggle */}
        <div className="mt-5 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setShowDemo(!showDemo)}
            className="w-full text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            {showDemo ? '▲ Ẩn tài khoản demo' : '▼ tai khoan demo nha ae , quen thi an vo day)'}
          </button>
          {showDemo && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map(acc => (
                <button
                  key={acc.email}
                  onClick={() => { setForm({ email: acc.email, password: acc.pass }); setShowDemo(false) }}
                  className={`flex flex-col items-start px-3 py-2 rounded-xl border text-left transition-all ${acc.color}`}
                >
                  <span className="text-xs font-semibold">{acc.label}</span>
                  <span className="text-xs opacity-50 truncate w-full">{acc.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
