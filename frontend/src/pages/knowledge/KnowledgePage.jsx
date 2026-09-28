import { useState, useEffect, useRef } from 'react'
import { Upload, Trash2, RefreshCw, Search, FileText, CheckCircle, XCircle, Clock, Loader, X, Copy, Archive, History } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import clsx from 'clsx'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

const STATUS = {
  pending: { label: 'Chờ xử lý', icon: Clock, cls: 'text-amber-400 bg-amber-400/10 border border-amber-400/20' },
  processing: { label: 'Đang xử lý', icon: Loader, cls: 'text-blue-400 bg-blue-400/10 border border-blue-400/20' },
  indexed: { label: 'Đã index', icon: CheckCircle, cls: 'text-green-400 bg-green-400/10 border border-green-400/20' },
  failed: { label: 'Lỗi', icon: XCircle, cls: 'text-red-400 bg-red-400/10 border border-red-400/20' },
  duplicate: { label: 'Trùng lặp', icon: Copy, cls: 'text-slate-400 bg-slate-400/10 border border-slate-400/20' },
}
const APPROVAL = {
  pending_approval: { label: 'Chờ duyệt', cls: 'text-orange-400 bg-orange-400/10 border border-orange-400/20' },
  approved: { label: 'Đã duyệt', cls: 'text-green-400 bg-green-400/10 border border-green-400/20' },
  rejected: { label: 'Bị từ chối', cls: 'text-red-400 bg-red-400/10 border border-red-400/20' },
}

const EXT_COLOR = {
  pdf: 'text-red-400 bg-red-400/10', docx: 'text-blue-400 bg-blue-400/10',
  txt: 'text-slate-400 bg-slate-400/10', xlsx: 'text-green-400 bg-green-400/10',
  csv: 'text-amber-400 bg-amber-400/10', md: 'text-purple-400 bg-purple-400/10',
  jpg: 'text-pink-400 bg-pink-400/10', jpeg: 'text-pink-400 bg-pink-400/10',
  png: 'text-pink-400 bg-pink-400/10', webp: 'text-pink-400 bg-pink-400/10',
}

function fmtSize(b) {
  if (!b) return '0B'
  return b < 1024 * 1024 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1024 / 1024).toFixed(1)}MB`
}

export default function KnowledgePage() {
  const { user, isManager, isMasterAdmin } = useAuth()
  const [docs, setDocs] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadForm, setUploadForm] = useState({ name: '', description: '', tags: '', departmentId: '' })
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    api.get('/departments').then(r => setDepartments(r.data)).catch(() => {})
  }, [])

  const fetchDocs = async () => {
    setLoading(true)
    try {
      const params = { page, limit: 15 }
      if (search) params.search = search
      if (filterStatus) params.status = filterStatus
      if (filterDept) params.department = filterDept
      const { data } = await api.get('/knowledge', { params })
      setDocs(data.documents || []); setTotal(data.total || 0)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchDocs() }, [page, search, filterStatus, filterDept])

  // Auto-refresh for processing docs
  useEffect(() => {
    const hasPending = docs.some(d => d.status === 'pending' || d.status === 'processing')
    if (!hasPending) return
    const t = setInterval(fetchDocs, 5000)
    return () => clearInterval(t)
  }, [docs])

  const openUpload = () => {
    // Pre-select department for non-master_admin
    const deptId = !isMasterAdmin ? (user?.department?._id || '') : ''
    setUploadForm({ name: '', description: '', tags: '', departmentId: deptId })
    setSelectedFile(null)
    setShowUpload(true)
  }

  const handleFile = (file) => {
    if (!file) return
    if (file.size > 50 * 1024 * 1024) { toast.error('File tối đa 50MB'); return }
    setSelectedFile(file)
    setUploadForm(f => ({ ...f, name: file.name }))
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  const handleUpload = async () => {
    if (!selectedFile) { toast.error('Vui lòng chọn file'); return }
    const deptId = uploadForm.departmentId || user?.department?._id
    if (!deptId) { toast.error('Vui lòng chọn phòng ban'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', selectedFile)
      fd.append('name', uploadForm.name || selectedFile.name)
      fd.append('description', uploadForm.description)
      fd.append('tags', uploadForm.tags)
      fd.append('departmentId', deptId)
      const dept = departments.find(d => d._id === deptId)
      if (dept) fd.append('departmentCode', dept.code)
      const { data } = await api.post('/knowledge/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      if (data.count) {
        // Uploaded to ALL departments
        toast.success(`Đã upload cho ${data.count} phòng ban! Đang xử lý...`)
      } else {
        setDocs(prev => [data, ...prev])
        setTotal(t => t + 1)
        toast.success('Đã tải lên! Đang xử lý...')
      }
      setShowUpload(false)
    } catch (err) { toast.error(err.response?.data?.error || 'Upload thất bại') }
    finally { setUploading(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Xóa tài liệu này?')) return
    try {
      await api.delete(`/knowledge/${id}`)
      setDocs(prev => prev.filter(d => d._id !== id))
      setTotal(t => t - 1)
      toast.success('Đã xóa')
    } catch (err) { toast.error(err.response?.data?.error || 'Xóa thất bại') }
  }

  const handleReindex = async (id) => {
    try {
      await api.post(`/knowledge/${id}/reindex`)
      setDocs(prev => prev.map(d => d._id === id ? { ...d, status: 'pending' } : d))
      toast.success('Đang index lại...')
    } catch { toast.error('Thất bại') }
  }

  const handleApprove = async (id) => {
    try {
      await api.post(`/knowledge/${id}/approve`)
      setDocs(prev => prev.map(d => d._id === id ? { ...d, approvalStatus: 'approved', status: 'pending' } : d))
      toast.success('Đã duyệt tài liệu, đang index...')
    } catch (err) { toast.error(err.response?.data?.error || 'Duyệt thất bại') }
  }

  const handleReject = async (id) => {
    const reason = prompt('Lý do từ chối:')
    if (reason === null) return
    try {
      await api.post(`/knowledge/${id}/reject`, { reason })
      setDocs(prev => prev.map(d => d._id === id ? { ...d, approvalStatus: 'rejected' } : d))
      toast.success('Đã từ chối tài liệu')
    } catch { toast.error('Thất bại') }
  }

  return (
    <div className="p-6 space-y-5">
      {/* Upload modal */}
      {showUpload && (
        <div className="modal-overlay animate-fade-in">
          <div className="modal-box w-full max-w-md animate-fade-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h2 className="font-bold text-white">📄 Upload tài liệu</h2>
              <button onClick={() => setShowUpload(false)} className="text-slate-500 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-all"><X size={16} /></button>
            </div>

            <div className="p-6 space-y-4">
              {/* Drop zone */}
              <div
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                className={clsx('border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all',
                  dragOver ? 'border-blue-500 bg-blue-500/10' :
                  selectedFile ? 'border-green-500/50 bg-green-500/5' :
                  'border-slate-700 hover:border-slate-500 hover:bg-slate-800/50')}>
                <FileText size={28} className={clsx('mx-auto mb-2', selectedFile ? 'text-green-400' : 'text-slate-600')} />
                {selectedFile
                  ? <><p className="text-sm font-medium text-green-400">{selectedFile.name}</p>
                      <p className="text-xs text-slate-500 mt-1">{fmtSize(selectedFile.size)}</p></>
                  : <><p className="text-sm text-slate-400">Kéo thả hoặc nhấn để chọn file</p>
                      <p className="text-xs text-slate-600 mt-1">PDF, DOCX, TXT, XLSX, CSV, MD, JPG, PNG • tối đa 50MB</p></>
                }
                <input ref={fileRef} type="file" className="hidden" accept=".pdf,.docx,.txt,.xlsx,.csv,.md,.jpg,.jpeg,.png,.webp"
                  onChange={e => handleFile(e.target.files[0])} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Tên tài liệu</label>
                <input className="input" value={uploadForm.name}
                  onChange={e => setUploadForm({ ...uploadForm, name: e.target.value })}
                  placeholder="Nhập tên hiển thị" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Mô tả</label>
                <input className="input" value={uploadForm.description}
                  onChange={e => setUploadForm({ ...uploadForm, description: e.target.value })}
                  placeholder="Mô tả ngắn gọn về tài liệu" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Tags</label>
                <input className="input" value={uploadForm.tags}
                  onChange={e => setUploadForm({ ...uploadForm, tags: e.target.value })}
                  placeholder="hr, chính sách, quy trình (phân cách bằng dấu phẩy)" />
              </div>

              {/* Department selector - shown for master_admin AND managers without dept */}
              {(isMasterAdmin || !user?.department?._id) && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Phòng ban <span className="text-red-400">*</span>
                  </label>
                  <select className="input" value={uploadForm.departmentId}
                    onChange={e => setUploadForm({ ...uploadForm, departmentId: e.target.value })}>
                    <option value="">-- Chọn phòng ban --</option>
                    {isMasterAdmin && <option value="ALL">🌐 Tất cả phòng ban</option>}
                    {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select>
                </div>
              )}

              {/* Show dept info for non-master users */}
              {!isMasterAdmin && user?.department?._id && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-sm text-blue-400">
                  📌 Phòng ban: <span className="font-semibold">{user.department.name}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-800 flex gap-3 justify-end">
              <button onClick={() => setShowUpload(false)} className="btn-secondary">Hủy</button>
              <button onClick={handleUpload} disabled={uploading || !selectedFile} className="btn-primary">
                {uploading
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Đang tải...</>
                  : <><Upload size={14} /> Upload</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Tài liệu nội bộ</h1>
          <p className="page-sub">Tổng: {total} tài liệu</p>
        </div>
        <button onClick={openUpload} className="btn-primary">
          <Upload size={15} /> Upload tài liệu
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input pl-9" placeholder="Tìm tài liệu..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="input w-40" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
          <option value="">Tất cả trạng thái</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {isMasterAdmin && (
          <select className="input w-44" value={filterDept} onChange={e => { setFilterDept(e.target.value); setPage(1) }}>
            <option value="">Tất cả phòng ban</option>
            {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
        )}
      </div>

      {/* Docs grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading
          ? [...Array(6)].map((_, i) => (
            <div key={i} className="card space-y-3">
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-3 w-1/2" />
              <div className="skeleton h-3 w-1/3" />
            </div>
          ))
          : docs.map(doc => {
            const ext = doc.originalName?.split('.').pop()?.toLowerCase() || 'txt'
            const st = STATUS[doc.status] || STATUS.pending
            const Icon = st.icon
            return (
              <div key={doc._id} className={clsx('card-hover group flex flex-col gap-3', doc.isActive === false && 'opacity-60')}>
                <div className="flex items-start gap-3">
                  <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold uppercase', EXT_COLOR[ext] || EXT_COLOR.txt)}>
                    {ext}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm truncate">{doc.name}</p>
                    <p className="text-xs text-slate-500">{doc.department?.name} · {fmtSize(doc.fileSize)}</p>
                  </div>
                </div>

                {doc.isActive === false && (
                  <div className="flex items-start gap-1.5 bg-slate-800/60 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-400">
                    <Archive size={12} className="flex-shrink-0 mt-0.5" />
                    <span>
                      Đã lưu trữ{doc.supersededBy ? ' — có tài liệu mới hơn thay thế' : ' — trùng lặp với tài liệu khác'}
                      {doc.versionNote && <><br /><span className="text-slate-500">{doc.versionNote}</span></>}
                    </span>
                  </div>
                )}
                {doc.isActive !== false && doc.supersedes && (
                  <div className="flex items-start gap-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg px-2.5 py-1.5 text-xs text-blue-300">
                    <History size={12} className="flex-shrink-0 mt-0.5" />
                    <span>
                      Bản cập nhật, đã thay thế tài liệu cũ
                      {doc.versionNote && <><br /><span className="text-blue-400/70">{doc.versionNote}</span></>}
                    </span>
                  </div>
                )}

                {doc.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {doc.tags.map(t => <span key={t} className="badge bg-slate-800 text-slate-400">{t}</span>)}
                  </div>
                )}

                <div className="flex items-center justify-between mt-auto flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Approval badge for pending items */}
                    {doc.approvalStatus === 'pending_approval' && (
                      <span className={clsx('badge', APPROVAL.pending_approval.cls)}>⏳ Chờ duyệt</span>
                    )}
                    {doc.approvalStatus === 'rejected' && (
                      <span className={clsx('badge', APPROVAL.rejected.cls)}>✕ Bị từ chối</span>
                    )}
                    {doc.approvalStatus === 'approved' && (
                      <span className={clsx('badge', st.cls)}>
                        <Icon size={11} className={doc.status === 'processing' ? 'animate-spin' : ''} />
                        {st.label}
                        {doc.chunkCount > 0 && <span className="opacity-60 ml-1">· {doc.chunkCount} chunks</span>}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Manager: approve/reject pending docs */}
                    {isManager && doc.approvalStatus === 'pending_approval' && (
                      <>
                        <button onClick={() => handleApprove(doc._id)} title="Duyệt"
                          className="p-1.5 text-slate-500 hover:text-green-400 hover:bg-green-400/10 rounded-lg transition-all text-xs font-medium px-2">
                          ✓ Duyệt
                        </button>
                        <button onClick={() => handleReject(doc._id)} title="Từ chối"
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all text-xs font-medium px-2">
                          ✕ Từ chối
                        </button>
                      </>
                    )}
                    {isManager && doc.approvalStatus === 'approved' && ['failed', 'indexed', 'duplicate'].includes(doc.status) && (
                      <button onClick={() => handleReindex(doc._id)} title="Index lại"
                        className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all">
                        <RefreshCw size={13} />
                      </button>
                    )}
                    {isManager && (
                      <button onClick={() => handleDelete(doc._id)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-700">
                  {doc.uploadedBy?.name} · {format(new Date(doc.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })}
                </p>
              </div>
            )
          })
        }
      </div>

      {!loading && docs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-600">
          <FileText size={44} className="mb-3 opacity-30" />
          <p className="font-medium">Chưa có tài liệu nào</p>
          <button onClick={openUpload} className="btn-primary mt-4"><Upload size={15} /> Upload tài liệu đầu tiên</button>
        </div>
      )}

      {/* Pagination */}
      {Math.ceil(total / 15) > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary px-3 py-1.5 text-xs">← Trước</button>
          <span className="text-sm text-slate-400">{page} / {Math.ceil(total / 15)}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 15)} className="btn-secondary px-3 py-1.5 text-xs">Tiếp →</button>
        </div>
      )}
    </div>
  )
}
