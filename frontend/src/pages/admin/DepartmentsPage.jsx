import { useState, useEffect } from 'react'
import { Building2, Edit, Save, X, Users, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import clsx from 'clsx'

const DEPT_ICONS = { HR: '👥', IT: '💻', SALES: '🛒', ACCOUNTING: '📊', GENERAL: '🏢' }
const DEPT_BG = { HR: '#6366f1', IT: '#3B82F6', SALES: '#10B981', ACCOUNTING: '#F59E0B', GENERAL: '#8B5CF6' }

export default function DepartmentsPage() {
  const { isMasterAdmin } = useAuth()
  const [departments, setDepartments] = useState([])
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [expanded, setExpanded] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/departments')
      .then(r => setDepartments(r.data))
      .catch(() => toast.error('Không tải được danh sách phòng ban'))
      .finally(() => setLoading(false))
  }, [])

  const startEdit = (dept) => {
    setEditing(dept._id)
    setEditForm({
      description: dept.description || '',
      welcomeMessage: dept.welcomeMessage || '',
      aiSystemPrompt: dept.aiSystemPrompt || '',
      color: dept.color || DEPT_BG[dept.code] || '#3B82F6',
    })
  }

  const cancelEdit = () => { setEditing(null); setEditForm({}) }

  const saveEdit = async (dept) => {
    setSaving(true)
    try {
      const { data } = await api.put(`/departments/${dept._id}`, editForm)
      setDepartments(prev => prev.map(d => d._id === dept._id ? data : d))
      setEditing(null)
      toast.success('Đã lưu cấu hình phòng ban')
    } catch { toast.error('Lưu thất bại') }
    finally { setSaving(false) }
  }

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="page-title">Phòng ban</h1>
        <p className="page-sub">Cấu hình AI và thông tin từng phòng ban</p>
      </div>

      <div className="space-y-4">
        {departments.map(dept => {
          const isEditing = editing === dept._id
          const isExpanded = expanded[dept._id]
          const color = dept.color || DEPT_BG[dept.code] || '#3B82F6'

          return (
            <div key={dept._id} className="card overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                  style={{ background: color + '20', border: `1px solid ${color}30` }}>
                  {DEPT_ICONS[dept.code] || '🏢'}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-white">{dept.name}</h2>
                    <span className="badge bg-slate-800 text-slate-400 font-mono">{dept.code}</span>
                    {dept.memberCount !== undefined && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Users size={11} /> {dept.memberCount || 0} thành viên
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5 truncate">
                    {dept.manager?.name ? `👤 Quản lý: ${dept.manager.name}` : '👤 Chưa có quản lý'}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {isMasterAdmin && (
                    isEditing ? (
                      <div className="flex gap-2">
                        <button onClick={cancelEdit} className="btn-ghost py-1.5 px-3 text-xs">
                          <X size={13} /> Hủy
                        </button>
                        <button onClick={() => saveEdit(dept)} disabled={saving} className="btn-primary py-1.5 px-3 text-xs">
                          {saving ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save size={13} /> Lưu</>}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(dept)} className="btn-secondary py-1.5 px-3 text-xs">
                        <Edit size={13} /> Chỉnh sửa
                      </button>
                    )
                  )}
                  <button onClick={() => toggleExpand(dept._id)} className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* Expandable content */}
              {(isExpanded || isEditing) && (
                <div className="mt-5 pt-5 border-t border-slate-800 space-y-4 animate-fade-up">
                  {isEditing ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1.5">Mô tả phòng ban</label>
                          <textarea className="input" rows={2} value={editForm.description}
                            onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                            placeholder="Mô tả chức năng, nhiệm vụ của phòng ban..." />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1.5">Tin nhắn chào</label>
                          <textarea className="input" rows={2} value={editForm.welcomeMessage}
                            onChange={e => setEditForm({ ...editForm, welcomeMessage: e.target.value })}
                            placeholder="Tin nhắn hiển thị khi bắt đầu chat..." />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">System Prompt AI</label>
                        <textarea className="input font-mono text-xs" rows={4} value={editForm.aiSystemPrompt}
                          onChange={e => setEditForm({ ...editForm, aiSystemPrompt: e.target.value })}
                          placeholder="Hướng dẫn hành vi AI cho phòng ban này..." />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Màu đại diện</label>
                        <div className="flex items-center gap-3">
                          <input type="color" value={editForm.color}
                            onChange={e => setEditForm({ ...editForm, color: e.target.value })}
                            className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                          <span className="text-sm text-slate-400 font-mono">{editForm.color}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Mô tả</p>
                        <p className="text-sm text-slate-300">{dept.description || <span className="text-slate-600 italic">Chưa có mô tả</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Tin nhắn chào</p>
                        <p className="text-sm text-slate-300">{dept.welcomeMessage || <span className="text-slate-600 italic">Mặc định</span>}</p>
                      </div>
                      {dept.aiSystemPrompt && (
                        <div className="md:col-span-2">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">System Prompt</p>
                          <p className="text-xs text-slate-400 font-mono bg-slate-800 rounded-xl p-3 line-clamp-3">{dept.aiSystemPrompt}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
