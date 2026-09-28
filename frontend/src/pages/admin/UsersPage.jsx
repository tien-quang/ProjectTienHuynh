import { useState, useEffect } from 'react'
import { Plus, Search, Edit, Trash2, RotateCcw, Shield, ChevronDown, X, User } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import clsx from 'clsx'

const ROLE_LABEL = { employee: 'Nhân viên', manager: 'Quản lý', master_admin: 'Master Admin' }
const ROLE_COLOR = {
  employee: 'text-slate-400 bg-slate-400/10 border border-slate-400/20',
  manager: 'text-blue-400 bg-blue-400/10 border border-blue-400/20',
  master_admin: 'text-amber-400 bg-amber-400/10 border border-amber-400/20',
}

function UserModal({ user: editUser, departments, onClose, onSave, isMasterAdmin }) {
  const isEdit = !!editUser
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'employee',
    ...editUser,
    department: editUser?.department?._id || editUser?.department || '',
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!form.name || !form.email) { toast.error('Vui lòng điền họ tên và email'); return }
    if (!isEdit && !form.password) { toast.error('Vui lòng nhập mật khẩu'); return }
    if (!isEdit && form.password.length < 6) { toast.error('Mật khẩu tối thiểu 6 ký tự'); return }
    setLoading(true)
    try {
      const payload = { name: form.name, email: form.email, role: form.role, department: form.department || null }
      if (!isEdit) payload.password = form.password
      const { data } = isEdit
        ? await api.put(`/users/${editUser._id}`, payload)
        : await api.post('/users', { ...payload, password: form.password })
      onSave(data, isEdit)
      toast.success(isEdit ? 'Đã cập nhật tài khoản' : 'Đã tạo tài khoản')
      onClose()
    } catch (err) { toast.error(err.response?.data?.error || 'Thao tác thất bại') }
    finally { setLoading(false) }
  }

  const f = (k) => ({ value: form[k] || '', onChange: e => setForm({ ...form, [k]: e.target.value }) })

  return (
    <div className="modal-overlay animate-fade-in">
      <div className="modal-box w-full max-w-md animate-fade-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="font-bold text-white">{isEdit ? '✏️ Sửa tài khoản' : '➕ Tạo tài khoản mới'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-all"><X size={16} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Họ và tên *</label>
            <input className="input" placeholder="Nguyễn Văn A" {...f('name')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email *</label>
            <input className="input" type="email" placeholder="email@tttn.vn" {...f('email')} />
          </div>
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Mật khẩu *</label>
              <input className="input" type="password" placeholder="Tối thiểu 6 ký tự" {...f('password')} />
            </div>
          )}
          {isMasterAdmin && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Phân quyền</label>
              <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="employee">Nhân viên</option>
                <option value="manager">Quản lý</option>
                <option value="master_admin">Master Admin</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Phòng ban</label>
            <select className="input" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
              <option value="">-- Chưa phân phòng ban --</option>
              {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-800 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Hủy</button>
          <button onClick={handleSubmit} disabled={loading} className="btn-primary">
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (isEdit ? 'Cập nhật' : 'Tạo tài khoản')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function UsersPage() {
  const { isMasterAdmin } = useAuth()
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [modal, setModal] = useState(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 15

  useEffect(() => {
    api.get('/departments').then(r => setDepartments(r.data)).catch(() => {})
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const params = { page, limit: LIMIT }
      if (search) params.search = search
      if (filterRole) params.role = filterRole
      if (filterDept) params.department = filterDept
      const { data } = await api.get('/users', { params })
      setUsers(data.users || []); setTotal(data.total || 0)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchUsers() }, [page, search, filterRole, filterDept])

  const handleSave = (saved, isEdit) => {
    if (isEdit) setUsers(prev => prev.map(u => u._id === saved._id ? saved : u))
    else { setUsers(prev => [saved, ...prev]); setTotal(t => t + 1) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Xóa tài khoản này? Hành động không thể hoàn tác.')) return
    try {
      await api.delete(`/users/${id}`)
      setUsers(prev => prev.filter(u => u._id !== id))
      setTotal(t => t - 1)
      toast.success('Đã xóa tài khoản')
    } catch (err) { toast.error(err.response?.data?.error || 'Xóa thất bại') }
  }

  const handleResetPw = async (id) => {
    if (!confirm('Reset mật khẩu về mặc định?')) return
    try {
      const { data } = await api.post(`/users/${id}/reset-password`)
      toast.success(`Mật khẩu mới: ${data.newPassword}`, { duration: 6000 })
    } catch (err) { toast.error(err.response?.data?.error || 'Reset thất bại') }
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="p-6 space-y-5">
      {modal && (
        <UserModal
          user={modal === 'create' ? null : modal}
          departments={departments}
          onClose={() => setModal(null)}
          onSave={handleSave}
          isMasterAdmin={isMasterAdmin}
        />
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý người dùng</h1>
          <p className="page-sub">Tổng: {total} tài khoản</p>
        </div>
        <button onClick={() => setModal('create')} className="btn-primary">
          <Plus size={16} /> Tạo tài khoản
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input pl-9" placeholder="Tìm theo tên, email..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="input w-36" value={filterRole} onChange={e => { setFilterRole(e.target.value); setPage(1) }}>
          <option value="">Tất cả quyền</option>
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input w-44" value={filterDept} onChange={e => { setFilterDept(e.target.value); setPage(1) }}>
          <option value="">Tất cả phòng ban</option>
          {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="table-head border-b border-slate-800 text-slate-600">
          <div className="flex-[2]">Người dùng</div>
          <div className="flex-1 hidden md:block">Phòng ban</div>
          <div className="w-28">Quyền</div>
          <div className="w-24 text-right">Thao tác</div>
        </div>

        {loading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="table-row border-b border-slate-800/60">
              <div className="flex-[2] flex items-center gap-3">
                <div className="skeleton w-9 h-9 rounded-full flex-shrink-0" />
                <div className="space-y-1.5 flex-1"><div className="skeleton h-3.5 w-32" /><div className="skeleton h-3 w-24" /></div>
              </div>
              <div className="flex-1 hidden md:block"><div className="skeleton h-3 w-24" /></div>
              <div className="w-28"><div className="skeleton h-5 w-20 rounded-full" /></div>
              <div className="w-24" />
            </div>
          ))
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-slate-600">
            <User size={36} className="mx-auto mb-2 opacity-30" />
            <p>Không tìm thấy người dùng</p>
          </div>
        ) : users.map(u => (
          <div key={u._id} className="table-row border-b border-slate-800/40 last:border-0 group">
            <div className="flex-[2] flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 bg-blue-600/20 border border-blue-600/30 rounded-full flex items-center justify-center text-blue-400 text-sm font-bold flex-shrink-0">
                {u.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{u.name}</p>
                <p className="text-xs text-slate-500 truncate">{u.email}</p>
              </div>
            </div>

            <div className="flex-1 hidden md:block">
              <p className="text-sm text-slate-400 truncate">{u.department?.name || <span className="text-slate-700 italic">Chưa phân</span>}</p>
            </div>

            <div className="w-28">
              <span className={clsx('badge', ROLE_COLOR[u.role])}><Shield size={10} /> {ROLE_LABEL[u.role]}</span>
            </div>

            <div className="w-24 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Không hiện thao tác với master_admin (trừ chính master_admin) */}
              {(u.role !== 'master_admin' || isMasterAdmin) && (
                <button onClick={() => setModal(u)} title="Sửa"
                  className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all">
                  <Edit size={13} />
                </button>
              )}
              {isMasterAdmin && u.role !== 'master_admin' && (
                <button onClick={() => handleResetPw(u._id)} title="Reset mật khẩu"
                  className="p-1.5 text-slate-500 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-all">
                  <RotateCcw size={13} />
                </button>
              )}
              {u.role !== 'master_admin' && (
                <button onClick={() => handleDelete(u._id)} title="Xóa"
                  className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary px-3 py-1.5 text-xs">← Trước</button>
          <span className="text-sm text-slate-400">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-secondary px-3 py-1.5 text-xs">Tiếp →</button>
        </div>
      )}
    </div>
  )
}
