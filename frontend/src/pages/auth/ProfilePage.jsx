import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Lock, Save, Shield, Mail, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'

const ROLE_LABELS = { employee: 'Nhân viên', manager: 'Quản lý', master_admin: 'Master Admin' }
const ROLE_COLORS = {
  employee: 'text-slate-400 bg-slate-400/10 border border-slate-400/20',
  manager: 'text-blue-400 bg-blue-400/10 border border-blue-400/20',
  master_admin: 'text-amber-400 bg-amber-400/10 border border-amber-400/20',
}

export default function ProfilePage() {
  const { user, setUser, logout } = useAuth()
  const navigate = useNavigate()
  const [nameForm, setNameForm] = useState({ name: user?.name || '' })
  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirm: '' })
  const [savingName, setSavingName] = useState(false)
  const [savingPw, setSavingPw] = useState(false)

  const saveName = async () => {
    if (!nameForm.name.trim()) { toast.error('Tên không được để trống'); return }
    setSavingName(true)
    try {
      const { data } = await api.put(`/users/${user._id}`, { name: nameForm.name })
      setUser(prev => ({ ...prev, name: data.name }))
      toast.success('Đã cập nhật tên')
    } catch (err) { toast.error(err.response?.data?.error || 'Cập nhật thất bại') }
    finally { setSavingName(false) }
  }

  const savePw = async () => {
    if (!pwForm.oldPassword || !pwForm.newPassword) { toast.error('Vui lòng điền đầy đủ'); return }
    if (pwForm.newPassword.length < 6) { toast.error('Mật khẩu mới ít nhất 6 ký tự'); return }
    if (pwForm.newPassword !== pwForm.confirm) { toast.error('Mật khẩu xác nhận không khớp'); return }
    setSavingPw(true)
    try {
      await api.put(`/users/${user._id}/password`, { oldPassword: pwForm.oldPassword, newPassword: pwForm.newPassword })
      toast.success('Đổi mật khẩu thành công! Đang đăng xuất...')
      setPwForm({ oldPassword: '', newPassword: '', confirm: '' })
      // Backend đã xóa tất cả refresh tokens → cần đăng nhập lại
      setTimeout(async () => {
        await logout()
      }, 1500)
    } catch (err) { toast.error(err.response?.data?.error || 'Đổi mật khẩu thất bại') }
    finally { setSavingPw(false) }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Hồ sơ cá nhân</h1>
        <p className="text-slate-400 text-sm mt-0.5">Quản lý thông tin tài khoản của bạn</p>
      </div>

      {/* Avatar + info */}
      <div className="card flex items-center gap-5">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-600/30 flex-shrink-0">
          {user?.name?.[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-white">{user?.name}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`badge ${ROLE_COLORS[user?.role]}`}><Shield size={10} /> {ROLE_LABELS[user?.role]}</span>
            <span className="flex items-center gap-1 text-xs text-slate-500"><Mail size={11} /> {user?.email}</span>
            {user?.department?.name && (
              <span className="flex items-center gap-1 text-xs text-slate-500"><Building2 size={11} /> {user.department.name}</span>
            )}
          </div>
        </div>
      </div>

      {/* Edit name */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-white flex items-center gap-2"><User size={16} className="text-blue-400" /> Thông tin cơ bản</h3>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Họ và tên</label>
          <input className="input" value={nameForm.name} onChange={e => setNameForm({ name: e.target.value })} placeholder="Nhập tên của bạn" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
          <input className="input opacity-60 cursor-not-allowed" value={user?.email || ''} readOnly />
        </div>
        <button onClick={saveName} disabled={savingName} className="btn-primary">
          {savingName ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save size={15} /> Lưu thay đổi</>}
        </button>
      </div>

      {/* Change password */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-white flex items-center gap-2"><Lock size={16} className="text-blue-400" /> Đổi mật khẩu</h3>
        {[
          { label: 'Mật khẩu hiện tại', key: 'oldPassword', placeholder: '••••••••' },
          { label: 'Mật khẩu mới', key: 'newPassword', placeholder: 'Tối thiểu 6 ký tự' },
          { label: 'Xác nhận mật khẩu mới', key: 'confirm', placeholder: 'Nhập lại mật khẩu mới' },
        ].map(({ label, key, placeholder }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
            <input type="password" className="input" placeholder={placeholder}
              value={pwForm[key]} onChange={e => setPwForm({ ...pwForm, [key]: e.target.value })} />
          </div>
        ))}
        <button onClick={savePw} disabled={savingPw} className="btn-primary">
          {savingPw ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Lock size={15} /> Đổi mật khẩu</>}
        </button>
      </div>
    </div>
  )
}
