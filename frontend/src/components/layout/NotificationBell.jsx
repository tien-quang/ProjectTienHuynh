import { useState, useEffect, useRef } from 'react'
import { Bell, X, CheckCheck } from 'lucide-react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import api from '../../services/api'
import clsx from 'clsx'

const TYPE_COLOR = {
  new_document: 'bg-blue-500',
  document_indexed: 'bg-green-500',
  new_product: 'bg-purple-500',
  system: 'bg-slate-500',
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const ref = useRef(null)

  useEffect(() => {
    fetchNotifications()
    const t = setInterval(fetchNotifications, 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchNotifications = async () => {
    try {
      const { data } = await api.get('/notifications?limit=15')
      setNotifications(data.notifications || [])
      setUnread(data.unread || 0)
    } catch {}
  }

  const markAllRead = async () => {
    try { await api.put('/notifications/read-all'); setUnread(0); setNotifications(prev => prev.map(n => ({ ...n, read: true }))) } catch {}
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="relative p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all">
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fade-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <span className="font-semibold text-white text-sm">Thông báo</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  <CheckCheck size={12} /> Đọc hết
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white"><X size={14} /></button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-sm">
                <Bell size={24} className="mx-auto mb-2 opacity-30" />
                Không có thông báo
              </div>
            ) : notifications.map(n => (
              <div key={n._id} className={clsx('px-4 py-3 border-b border-slate-800/60 hover:bg-slate-800/50 transition-all', !n.read && 'bg-blue-500/5')}>
                <div className="flex items-start gap-3">
                  <div className={clsx('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', TYPE_COLOR[n.type] || 'bg-slate-500')} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 leading-snug">{n.message}</p>
                    <p className="text-xs text-slate-500 mt-1">{format(new Date(n.createdAt), 'dd/MM HH:mm', { locale: vi })}</p>
                  </div>
                  {!n.read && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0 mt-2" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
