import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Send, Plus, Trash2, Download, Star, MessageSquare,
  Bot, User, Copy, AlertCircle, PanelLeft, Sparkles,
  ImagePlus, FileSearch2, X, Check, Square
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { streamMessage } from '../../services/stream'
import { useAuth } from '../../context/AuthContext'
import clsx from 'clsx'

const DEPT_ICONS = { HR: '👥', IT: '💻', SALES: '🛒', ACCOUNTING: '📊', GENERAL: '🏢' }

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-2 px-1">
      {[0,1,2].map(i => <div key={i} className="typing-dot w-2 h-2 bg-slate-500 rounded-full" />)}
    </div>
  )
}

const STATUS_LABEL = {
  understanding: 'Đang hiểu câu hỏi...',
  searching: 'Đang tra cứu tài liệu...',
  reading: 'Đang đọc nội dung liên quan...',
  writing: 'Đang soạn câu trả lời...',
}

// Ảnh chat không còn public → tải qua API có token rồi hiển thị bằng blob URL
function AuthImage({ url, ...props }) {
  const [src, setSrc] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    let objUrl = null
    setSrc(null); setFailed(false)
    api.get(`/chat/images/${encodeURIComponent(url.split('/').pop())}`, { responseType: 'blob' })
      .then(r => { if (!cancelled) { objUrl = URL.createObjectURL(r.data); setSrc(objUrl) } })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true; if (objUrl) URL.revokeObjectURL(objUrl) }
  }, [url])
  if (failed) return <div className="rounded-xl mb-2 px-3 py-2 text-xs text-slate-400 bg-slate-700/40">Không tải được ảnh</div>
  if (!src) return <div className="rounded-xl mb-2 w-[160px] h-[100px] bg-slate-700/40 animate-pulse" />
  return <img src={src} {...props} />
}

function Bubble({ msg }) {
  const isUser = msg.role === 'user'
  const copy = () => { navigator.clipboard.writeText(msg.content); toast.success('Đã sao chép') }

  return (
    <div className={clsx('flex gap-3 group', isUser ? 'chat-user flex-row-reverse' : 'chat-ai flex-row')}>
      <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
        isUser ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300')}>
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </div>
      <div className={clsx('max-w-[78%] flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
        <div className={clsx('px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm shadow-lg shadow-blue-600/20'
            : 'bg-slate-800 border border-slate-700 text-slate-100 rounded-2xl rounded-tl-sm'
        )}>
          {msg.imageUrl && (
            <AuthImage url={msg.imageUrl} alt="Ảnh đính kèm"
              className="rounded-xl mb-2 max-w-[220px] max-h-[220px] object-cover border border-white/10" />
          )}
          {isUser
            ? <p className="whitespace-pre-wrap">{msg.content}</p>
            : <div className="prose-chat"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown></div>
          }
        </div>
        {!isUser && msg.sources?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {msg.sources.slice(0,3).map((s,i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-full text-xs text-slate-400">
                <AlertCircle size={9} /> {s.documentName || 'Tài liệu'}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-xs text-slate-600">
            {formatDistanceToNow(new Date(msg.timestamp || Date.now()), { addSuffix: true, locale: vi })}
          </span>
          <button onClick={copy} className="text-slate-600 hover:text-slate-400"><Copy size={11} /></button>
        </div>
      </div>
    </div>
  )
}

export default function ChatPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [departments, setDepartments] = useState([])
  const [sessions, setSessions] = useState([])
  const [currentSession, setCurrentSession] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [showRating, setShowRating] = useState(false)
  const [rating, setRating] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const endRef = useRef(null)
  const textareaRef = useRef(null)
  const imageInputRef = useRef(null)
  const compareInputRef = useRef(null)
  const [sendingImage, setSendingImage] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [pendingCompare, setPendingCompare] = useState(null) // { pendingFile: { pendingId }, compareResult }
  const [streamStatus, setStreamStatus] = useState('')
  const abortRef = useRef(null)

  const isMasterAdmin = user?.role === 'master_admin'
  const userDeptId = user?.department?._id

  useEffect(() => {
    api.get('/departments').then(r => setDepartments(r.data)).catch(() => {})
    api.get('/chat/sessions?limit=50').then(r => setSessions(r.data.sessions || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!sessionId) { setCurrentSession(null); setMessages([]); return }
    setLoadingMsgs(true)
    api.get(`/chat/sessions/${sessionId}`)
      .then(r => { setCurrentSession(r.data); setMessages(r.data.messages || []) })
      .catch(() => { toast.error('Không tải được cuộc trò chuyện'); navigate('/chat') })
      .finally(() => setLoadingMsgs(false))
  }, [sessionId])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])

  const createSession = async (deptId) => {
    try {
      const { data } = await api.post('/chat/sessions', { departmentId: deptId })
      setSessions(prev => [data, ...prev])
      navigate(`/chat/${data._id}`)
    } catch { toast.error('Không tạo được cuộc hội thoại') }
  }

  // Master admin: auto-create session with first dept or allow picking
  const handleQuickChat = async () => {
    // Use GENERAL dept or first available
    const generalDept = departments.find(d => d.code === 'GENERAL') || departments[0]
    if (generalDept) await createSession(generalDept._id)
  }

  const deleteSession = async (id, e) => {
    e.stopPropagation()
    if (!confirm('Xóa cuộc trò chuyện này?')) return
    try {
      await api.delete(`/chat/sessions/${id}`)
      setSessions(prev => prev.filter(s => s._id !== id))
      if (sessionId === id) navigate('/chat')
      toast.success('Đã xóa')
    } catch { toast.error('Xóa thất bại') }
  }

  const stopStreaming = () => abortRef.current?.abort()

  const sendMessage = async () => {
    if (!input.trim() || !sessionId || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)
    setStreamStatus('understanding')

    const stamp = Date.now()
    const userTmpId = `tmp_u_${stamp}`
    const aiTmpId = `tmp_a_${stamp}`
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date().toISOString(), _id: userTmpId }])

    const ac = new AbortController()
    abortRef.current = ac

    // Gom delta và cập nhật tối đa 1 lần/frame để ReactMarkdown không re-render theo từng token
    let acc = ''
    let raf = 0
    const paint = () => {
      raf = 0
      setMessages(prev => prev.some(m => m._id === aiTmpId)
        ? prev.map(m => m._id === aiTmpId ? { ...m, content: acc } : m)
        : [...prev, { role: 'assistant', content: acc, sources: [], timestamp: new Date().toISOString(), _id: aiTmpId }])
    }
    const flush = () => { if (raf) cancelAnimationFrame(raf); paint() }

    try {
      const done = await streamMessage(sessionId, text, {
        signal: ac.signal,
        onStatus: setStreamStatus,
        onDelta: (d) => { acc += d; if (!raf) raf = requestAnimationFrame(paint) },
      })
      if (raf) cancelAnimationFrame(raf)
      setMessages(prev => [
        ...prev.filter(m => m._id !== userTmpId && m._id !== aiTmpId),
        done.userMessage,
        done.assistantMessage,
      ])
      setSessions(prev => prev.map(s => s._id === sessionId ? { ...s, lastMessageAt: new Date().toISOString() } : s))
    } catch (err) {
      if (err.name === 'AbortError') {
        if (acc) {
          // Server đã lưu phần trả lời dở dang → giữ lại trên màn hình
          flush()
        } else {
          // Chưa có chữ nào: server không lưu gì → bỏ câu hỏi tạm và trả lại vào ô nhập
          if (raf) cancelAnimationFrame(raf)
          setMessages(prev => prev.filter(m => m._id !== userTmpId && m._id !== aiTmpId))
          setInput(text)
        }
      } else {
        if (raf) cancelAnimationFrame(raf)
        setMessages(prev => prev.filter(m => m._id !== userTmpId && m._id !== aiTmpId))
        setInput(text)
        toast.error(err.message || 'Gửi thất bại. Vui lòng thử lại.')
      }
    } finally {
      abortRef.current = null
      setSending(false)
      setStreamStatus('')
      textareaRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }

  // Đính kèm ảnh: hỏi AI trực tiếp về nội dung ảnh (hóa đơn, ảnh lỗi sản phẩm, ảnh bảng biểu...)
  const sendImage = async (file) => {
    if (!file || !sessionId) return
    setSendingImage(true)
    const form = new FormData()
    form.append('image', file)
    form.append('message', input.trim())
    setInput('')
    try {
      const { data } = await api.post(`/chat/sessions/${sessionId}/message-image`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setMessages(prev => [...prev, data.userMessage, data.assistantMessage])
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gửi ảnh thất bại')
    } finally { setSendingImage(false); if (imageInputRef.current) imageInputRef.current.value = '' }
  }

  // Đính kèm tài liệu để so sánh với kho tri thức đã có (trùng khớp / khác biệt / thay thế)
  const sendCompareDoc = async (file) => {
    if (!file || !sessionId) return
    setComparing(true)
    const form = new FormData()
    form.append('file', file)
    try {
      const { data } = await api.post(`/chat/sessions/${sessionId}/compare-document`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setMessages(prev => [...prev,
        { role: 'user', content: `[Đính kèm tài liệu để so sánh] ${file.name}`, timestamp: new Date().toISOString() },
        data.assistantMessage,
      ])
      setPendingCompare({ pendingFile: data.pendingFile, compareResult: data.compareResult })
    } catch (err) {
      toast.error(err.response?.data?.error || 'So sánh thất bại')
    } finally { setComparing(false); if (compareInputRef.current) compareInputRef.current.value = '' }
  }

  const confirmCompare = async (action) => {
    if (!pendingCompare) return
    try {
      const { data } = await api.post(`/chat/sessions/${sessionId}/compare-document/confirm`, {
        ...pendingCompare.pendingFile, action,
      })
      toast.success(action === 'discard' ? 'Đã bỏ qua' : (data.message || 'Đã thêm vào kho tri thức'))
    } catch (err) {
      toast.error(err.response?.data?.error || 'Thao tác thất bại')
    } finally { setPendingCompare(null) }
  }

  const exportChat = async () => {
    try {
      const res = await api.get(`/chat/sessions/${sessionId}/export`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a'); a.href = url; a.download = `chat_${sessionId}.txt`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Export thất bại') }
  }

  const submitRating = async () => {
    if (!rating) return
    try { await api.post(`/chat/sessions/${sessionId}/rating`, { rating }); toast.success('Cảm ơn!'); setShowRating(false) } catch {}
  }

  // Departments visible in sidebar for creating sessions
  const visibleDepts = isMasterAdmin
    ? departments  // master admin sees all
    : departments.filter(d => String(d._id) === String(userDeptId))

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sessions sidebar */}
      <div className={clsx('flex flex-col border-r border-slate-800/60 transition-all duration-300 flex-shrink-0 overflow-hidden',
        sidebarOpen ? 'w-64' : 'w-0')} style={{ background: '#0d1424' }}>

        {/* Master admin: show all depts to create session */}
        {isMasterAdmin ? (
          <div className="p-3 border-b border-slate-800/60">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">Chat theo phòng ban</p>
            <div className="space-y-0.5">
              {departments.map(dept => (
                <button key={dept._id} onClick={() => createSession(dept._id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all text-sm group">
                  <span>{DEPT_ICONS[dept.code] || '🏢'}</span>
                  <span className="flex-1 text-left truncate">{dept.name}</span>
                  <Plus size={13} className="opacity-0 group-hover:opacity-100 text-blue-400 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Employee/Manager: show their department with quick start */
          <div className="p-3 border-b border-slate-800/60">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">Phòng ban của bạn</p>
            {visibleDepts.length > 0 ? (
              visibleDepts.map(dept => (
                <button key={dept._id} onClick={() => createSession(dept._id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-all text-sm group">
                  <span>{DEPT_ICONS[dept.code] || '🏢'}</span>
                  <span className="flex-1 text-left truncate">{dept.name}</span>
                  <Plus size={13} className="opacity-0 group-hover:opacity-100 text-blue-400 flex-shrink-0" />
                </button>
              ))
            ) : (
              <p className="text-xs text-slate-600 px-2 py-2">Chưa được phân phòng ban</p>
            )}
          </div>
        )}

        {/* Session history */}
        <div className="flex-1 overflow-y-auto p-2">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider px-2 mb-2">Lịch sử</p>
          {sessions.length === 0
            ? <p className="text-xs text-slate-700 text-center py-4">Chưa có cuộc hội thoại</p>
            : sessions.map(s => (
              <div key={s._id} onClick={() => navigate(`/chat/${s._id}`)}
                className={clsx('group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all mb-0.5',
                  sessionId === s._id ? 'bg-blue-600/15 border border-blue-600/25 text-blue-300' : 'hover:bg-slate-800 text-slate-400')}>
                <span className="text-base flex-shrink-0">{DEPT_ICONS[s.department?.code] || '💬'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate text-slate-200">{s.title || 'Cuộc hội thoại'}</p>
                  <p className="text-xs text-slate-600 truncate">{s.department?.name}</p>
                </div>
                <button onClick={(e) => deleteSession(s._id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all flex-shrink-0">
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          }
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/60 flex-shrink-0" style={{ background: '#0d1424' }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all">
            <PanelLeft size={16} />
          </button>
          {currentSession ? (
            <>
              <span className="text-xl">{currentSession.isGlobal ? '🌐' : (DEPT_ICONS[currentSession.department?.code] || '💬')}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{currentSession.title}</p>
                <p className="text-xs text-slate-500">{currentSession.isGlobal ? 'Toàn Hệ Thống — tìm kiếm tất cả phòng ban' : currentSession.department?.name}</p>
              </div>
              <button onClick={() => setShowRating(!showRating)}
                className="p-1.5 text-slate-500 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-all">
                <Star size={15} />
              </button>
              <button onClick={exportChat}
                className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all">
                <Download size={15} />
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-500 flex items-center gap-2">
              <MessageSquare size={15} /> {isMasterAdmin ? 'Chọn phòng ban bên trái để chat' : 'Nhấn vào phòng ban để bắt đầu'}
            </p>
          )}
        </div>

        {/* Rating bar */}
        {showRating && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/5 border-b border-amber-500/20 animate-fade-in">
            <p className="text-sm text-slate-300">Đánh giá:</p>
            <div className="flex gap-1">
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setRating(n)}
                  className={clsx('text-xl transition-all hover:scale-110', rating >= n ? 'text-amber-400' : 'text-slate-700')}>★</button>
              ))}
            </div>
            <button onClick={submitRating} disabled={!rating} className="btn-primary py-1 px-3 text-xs">Gửi</button>
            <button onClick={() => setShowRating(false)} className="text-xs text-slate-500 hover:text-slate-300">Bỏ qua</button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Welcome - no session */}
          {!currentSession && !loadingMsgs && (
            <div className="flex flex-col items-center justify-center h-full animate-fade-up">
              <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center mb-4">
                <Bot size={28} className="text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Xin chào, {user?.name?.split(' ').pop()}! 👋</h2>

              {isMasterAdmin ? (
                <>
                  <p className="text-slate-500 text-sm mb-6 text-center max-w-sm">
                    Bạn có quyền truy cập tài liệu của tất cả phòng ban.
                  </p>
                  {/* Chat toàn hệ thống */}
                  <button onClick={() => createSession('ALL')}
                    className="flex items-center gap-3 px-6 py-3 mb-4 bg-blue-600/20 border border-blue-600/40 rounded-2xl hover:bg-blue-600/30 transition-all group">
                    <span className="text-2xl">🌐</span>
                    <div className="text-left">
                      <p className="text-sm font-bold text-blue-300 group-hover:text-white transition-colors">Chat toàn hệ thống</p>
                      <p className="text-xs text-slate-500">Tìm kiếm trong tất cả tài liệu & phòng ban</p>
                    </div>
                  </button>
                  <p className="text-xs text-slate-600 mb-3">Hoặc chọn phòng ban cụ thể:</p>
                  <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
                    {departments.map(dept => (
                      <button key={dept._id} onClick={() => createSession(dept._id)}
                        className="flex items-center gap-3 p-4 card-hover text-left group hover:border-blue-600/40 transition-all">
                        <span className="text-2xl">{DEPT_ICONS[dept.code] || '🏢'}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">{dept.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">{dept.description || 'Nhấn để chat'}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : visibleDepts.length > 0 ? (
                <>
                  <p className="text-slate-500 text-sm mb-6 text-center max-w-sm">
                    Chat với AI về tài liệu của <span className="text-blue-400 font-medium">{visibleDepts[0]?.name}</span>
                  </p>
                  <button onClick={() => createSession(visibleDepts[0]._id)}
                    className="flex items-center gap-3 p-5 card-hover hover:border-blue-600/40 transition-all group">
                    <span className="text-3xl">{DEPT_ICONS[visibleDepts[0]?.code] || '🏢'}</span>
                    <div>
                      <p className="text-base font-semibold text-white group-hover:text-blue-400 transition-colors">Bắt đầu chat</p>
                      <p className="text-sm text-slate-500">{visibleDepts[0]?.name}</p>
                    </div>
                    <Sparkles size={18} className="text-blue-400 ml-2" />
                  </button>
                </>
              ) : (
                <p className="text-slate-500 text-sm text-center max-w-xs">
                  Tài khoản chưa được phân vào phòng ban nào.<br/>Liên hệ admin để được phân phòng ban.
                </p>
              )}
            </div>
          )}

          {loadingMsgs && (
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}

          {currentSession && messages.length === 0 && !loadingMsgs && (
            <div className="flex flex-col items-center justify-center h-full animate-fade-up">
              <span className="text-5xl mb-4">{currentSession.isGlobal ? '🌐' : (DEPT_ICONS[currentSession.department?.code] || '💬')}</span>
              <p className="text-slate-300 font-semibold text-lg mb-2">{currentSession.isGlobal ? 'Chat Toàn Hệ Thống' : currentSession.department?.name}</p>
              <p className="text-slate-500 text-sm">{currentSession.isGlobal ? 'Tìm kiếm đồng thời trong tất cả phòng ban và sản phẩm. Hãy đặt câu hỏi!' : (currentSession.department?.welcomeMessage || 'Hãy đặt câu hỏi để bắt đầu!')}</p>
            </div>
          )}

          {messages.map((msg, i) => <Bubble key={msg._id || i} msg={msg} />)}

          {sending && !messages.some(m => String(m._id).startsWith('tmp_a_')) && (
            <div className="flex gap-3 chat-ai">
              <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                <Bot size={13} className="text-slate-300" />
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-sm px-4 flex items-center gap-2">
                <TypingDots />
                {STATUS_LABEL[streamStatus] && <span className="text-xs text-slate-400 pr-1">{STATUS_LABEL[streamStatus]}</span>}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        {currentSession && (
          <div className="px-4 py-4 border-t border-slate-800/60 flex-shrink-0" style={{ background: '#0d1424' }}>
            {pendingCompare && (
              <div className="mb-3 flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                <FileSearch2 size={15} className="text-amber-400 flex-shrink-0" />
                <p className="text-xs text-amber-200 flex-1">
                  {pendingCompare.compareResult?.suggestSupersede
                    ? `Thay thế tài liệu "${pendingCompare.compareResult.targetDocName}" bằng tài liệu mới này?`
                    : 'Thêm tài liệu này vào kho tri thức của phòng ban?'}
                </p>
                <button onClick={() => confirmCompare('add')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs">
                  <Check size={12} /> {pendingCompare.compareResult?.suggestSupersede ? 'Thay thế' : 'Thêm mới'}
                </button>
                <button onClick={() => confirmCompare('discard')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs">
                  <X size={12} /> Bỏ qua
                </button>
              </div>
            )}
            <div className="flex gap-3 items-end">
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && sendImage(e.target.files[0])} />
              <input ref={compareInputRef} type="file" accept=".pdf,.docx,.txt,.xlsx,.csv,.md" className="hidden"
                onChange={e => e.target.files?.[0] && sendCompareDoc(e.target.files[0])} />
              <button type="button" title="Đính kèm ảnh để hỏi AI"
                onClick={() => imageInputRef.current?.click()} disabled={sendingImage}
                className="p-3 rounded-2xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-blue-400 hover:border-blue-500/40 transition-all flex-shrink-0 disabled:opacity-50">
                <ImagePlus size={17} />
              </button>
              <button type="button" title="Thêm tài liệu để so sánh với kho tri thức"
                onClick={() => compareInputRef.current?.click()} disabled={comparing}
                className="p-3 rounded-2xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-blue-400 hover:border-blue-500/40 transition-all flex-shrink-0 disabled:opacity-50">
                <FileSearch2 size={17} />
              </button>
              <div className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 130) + 'px'
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Nhập câu hỏi... (Enter để gửi, Shift+Enter xuống dòng)"
                  className="w-full bg-transparent text-slate-100 placeholder-slate-500 resize-none outline-none text-sm leading-relaxed max-h-32"
                />
              </div>
              {sending ? (
                <button onClick={stopStreaming} title="Dừng"
                  className="p-3 rounded-2xl transition-all flex-shrink-0 bg-slate-700 hover:bg-slate-600 text-white active:scale-95">
                  <Square size={17} />
                </button>
              ) : (
                <button
                  onClick={sendMessage}
                  disabled={!input.trim()}
                  className={clsx('p-3 rounded-2xl transition-all flex-shrink-0',
                    input.trim()
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 active:scale-95'
                      : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                  )}>
                  <Send size={17} />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-700 mt-2 text-center">AI có thể nhầm. Kiểm tra thông tin quan trọng trước khi dùng.</p>
          </div>
        )}
      </div>
    </div>
  )
}
