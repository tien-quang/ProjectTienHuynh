import { useState, useEffect } from 'react'
import { FileText, Search, Filter, ChevronDown } from 'lucide-react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import api from '../../services/api'
import clsx from 'clsx'

const ACTION_CONFIG = {
  USER_CREATE: { label: 'Tạo user', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  USER_UPDATE: { label: 'Sửa user', color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  USER_DELETE: { label: 'Xóa user', color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  USER_RESET_PASSWORD: { label: 'Reset mật khẩu', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  LOGIN: { label: 'Đăng nhập', color: 'text-slate-400 bg-slate-400/10 border-slate-400/20' },
  LOGOUT: { label: 'Đăng xuất', color: 'text-slate-400 bg-slate-400/10 border-slate-400/20' },
  LOGIN_FAILED: { label: 'Đăng nhập thất bại', color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  DOCUMENT_UPLOAD: { label: 'Upload tài liệu', color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  DOCUMENT_DELETE: { label: 'Xóa tài liệu', color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  PRODUCT_CREATE: { label: 'Tạo sản phẩm', color: 'text-teal-400 bg-teal-400/10 border-teal-400/20' },
  PRODUCT_UPDATE: { label: 'Sửa sản phẩm', color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  PRODUCT_DELETE: { label: 'Xóa sản phẩm', color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  CHAT_EXPORT: { label: 'Export chat', color: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20' },
  CHAT_DELETE: { label: 'Xóa chat', color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
}

const ALL_ACTIONS = Object.keys(ACTION_CONFIG)

export default function AuditPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filterAction, setFilterAction] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const LIMIT = 25

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = { page, limit: LIMIT }
      if (filterAction) params.action = filterAction
      const { data } = await api.get('/audit', { params })
      setLogs(data.logs || []); setTotal(data.total || 0)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchLogs() }, [page, filterAction])

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="p-6 space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-sub">Tổng: {total} sự kiện</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select className="input w-52" value={filterAction} onChange={e => { setFilterAction(e.target.value); setPage(1) }}>
          <option value="">Tất cả hành động</option>
          {ALL_ACTIONS.map(a => <option key={a} value={a}>{ACTION_CONFIG[a]?.label || a}</option>)}
        </select>
      </div>

      {/* Log list */}
      <div className="card p-0 overflow-hidden">
        <div className="table-head border-b border-slate-800 text-slate-600 text-xs">
          <div className="w-36">Thời gian</div>
          <div className="w-28">Hành động</div>
          <div className="flex-1">Người thực hiện</div>
          <div className="flex-1 hidden md:block">Mô tả</div>
          <div className="w-8" />
        </div>

        {loading ? (
          [...Array(8)].map((_, i) => (
            <div key={i} className="table-row border-b border-slate-800/40">
              <div className="w-36"><div className="skeleton h-3 w-28" /></div>
              <div className="w-28"><div className="skeleton h-5 w-24 rounded-full" /></div>
              <div className="flex-1"><div className="skeleton h-3 w-32" /></div>
              <div className="flex-1 hidden md:block"><div className="skeleton h-3 w-48" /></div>
            </div>
          ))
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-slate-600">
            <FileText size={36} className="mx-auto mb-2 opacity-30" />
            <p>Không có log nào</p>
          </div>
        ) : logs.map(log => {
          const cfg = ACTION_CONFIG[log.action] || { label: log.action, color: 'text-slate-400 bg-slate-400/10 border-slate-400/20' }
          const isExpanded = expandedId === log._id
          return (
            <div key={log._id} className="border-b border-slate-800/40 last:border-0">
              <div className="table-row group cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : log._id)}>
                <div className="w-36 text-xs text-slate-500 flex-shrink-0">
                  {log.createdAt ? format(new Date(log.createdAt), 'dd/MM/yy HH:mm:ss', { locale: vi }) : '—'}
                </div>
                <div className="w-28 flex-shrink-0">
                  <span className={clsx('badge border text-xs', cfg.color)}>{cfg.label}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 truncate">{log.user?.name || 'System'}</p>
                  <p className="text-xs text-slate-600 truncate">{log.user?.email}</p>
                </div>
                <div className="flex-1 hidden md:block min-w-0">
                  <p className="text-xs text-slate-400 truncate">{log.description || '—'}</p>
                </div>
                <div className="w-8 flex items-center justify-center">
                  <ChevronDown size={14} className={clsx('text-slate-600 transition-transform', isExpanded && 'rotate-180')} />
                </div>
              </div>

              {isExpanded && log.details && (
                <div className="px-4 pb-4 animate-fade-up">
                  <div className="bg-slate-800 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Chi tiết</p>
                    <pre className="text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap font-mono">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </div>
                  {log.ipAddress && (
                    <p className="text-xs text-slate-600 mt-2">IP: {log.ipAddress} · UA: {log.userAgent?.slice(0, 80)}...</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
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
