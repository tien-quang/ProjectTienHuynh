import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Eye, EyeOff, UserPlus, Bot, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { API_BASE_URL } from '../../services/config'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', departmentId: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [departments, setDepartments] = useState([])
  const [loadingDepts, setLoadingDepts] = useState(true)

  useEffect(() => {
    // Use fetch directly to avoid auth interceptor issues on public endpoint
    fetch(`${API_BASE_URL}/departments/public`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setDepartments(data)
      })
      .catch(() => {})
      .finally(() => setLoadingDepts(false))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Vui lòng nhập họ tên'); return }
    if (!form.email.trim()) { toast.error('Vui lòng nhập email'); return }
    if (!form.password) { toast.error('Vui lòng nhập mật khẩu'); return }
    if (form.password.length < 6) { toast.error('Mật khẩu phải ít nhất 6 ký tự'); return }
    if (form.password !== form.confirm) { toast.error('Mật khẩu xác nhận không khớp'); return }

    setLoading(true)
    try {
      await register(form.name.trim(), form.email.trim(), form.password, form.departmentId || undefined)
      toast.success('Đăng ký thành công! Chào mừng bạn 🎉')
      navigate('/chat')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Đăng ký thất bại. Vui lòng thử lại.')
    } finally { setLoading(false) }
  }

  const f = (field) => ({
    value: form[field],
    onChange: e => setForm(prev => ({ ...prev, [field]: e.target.value }))
  })

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#0a0f1e' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30">
            <Bot size={20} className="text-white" />
          </div>
          <span className="font-bold text-white text-lg">TTTN Chatbot</span>
        </div>

        <h2 className="text-2xl font-bold text-white mb-1">Tạo tài khoản</h2>
        <p className="text-slate-400 text-sm mb-6">Đăng ký để sử dụng hệ thống nội bộ</p>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Họ và tên *</label>
              <input type="text" required className="input" placeholder="Nguyễn Văn A" {...f('name')} />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email *</label>
              <input type="email" required className="input" placeholder="ten@tttn.vn" {...f('email')} />
            </div>

            {/* Department */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Building2 size={14} className="text-blue-400" /> Phòng ban
              </label>
              {loadingDepts ? (
                <div className="input flex items-center gap-2 text-slate-500">
                  <div className="w-4 h-4 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
                  Đang tải...
                </div>
              ) : (
                <select className="input" value={form.departmentId} onChange={e => setForm(p => ({ ...p, departmentId: e.target.value }))}>
                  <option value="">-- Chọn phòng ban của bạn --</option>
                  {departments.map(d => (
                    <option key={d._id} value={d._id}>{d.name}</option>
                  ))}
                </select>
              )}
              <p className="text-xs text-slate-600 mt-1">Admin có thể điều chỉnh sau khi đăng ký</p>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Mật khẩu *</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'} required
                  className="input pr-11" placeholder="Tối thiểu 6 ký tự"
                  {...f('password')}
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Xác nhận mật khẩu *</label>
              <input type="password" required className="input" placeholder="Nhập lại mật khẩu" {...f('confirm')} />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 text-base mt-2">
              {loading
                ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><UserPlus size={17} /> Đăng ký</>
              }
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-sm mt-4">
          Đã có tài khoản?{' '}
          <Link to="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  )
}
