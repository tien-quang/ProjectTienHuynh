import { useState, useEffect } from 'react'
import { Users, MessageSquare, BookOpen, Package, TrendingUp, Activity, Clock } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444']

function StatCard({ icon: Icon, label, value, color, sub }) {
  const cls = {
    blue: 'text-blue-400 bg-blue-400/10',
    green: 'text-green-400 bg-green-400/10',
    amber: 'text-amber-400 bg-amber-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
  }
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${cls[color]}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
        <p className="text-sm text-slate-400">{label}</p>
        {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="text-white font-bold">{payload[0].value} cuộc chat</p>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/dashboard')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">Tổng quan hệ thống · Xin chào, {user?.name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Nhân viên" value={data?.stats?.totalUsers} color="blue" />
        <StatCard icon={MessageSquare} label="Cuộc chat" value={data?.stats?.totalSessions} color="green" />
        <StatCard icon={BookOpen} label="Tài liệu" value={data?.stats?.totalDocs} color="amber" />
        <StatCard icon={Package} label="Sản phẩm" value={data?.stats?.totalProducts} color="purple" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card">
          <h3 className="font-semibold text-white mb-5 flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-400" /> Chat 7 ngày gần nhất
          </h3>
          {data?.dailyChats?.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.dailyChats} barSize={28}>
                <XAxis dataKey="_id" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => v?.slice(5)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#3B82F6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-slate-600 text-sm text-center py-16">Chưa có dữ liệu</p>}
        </div>

        <div className="card">
          <h3 className="font-semibold text-white mb-5 flex items-center gap-2">
            <Activity size={16} className="text-blue-400" /> Chat theo phòng ban
          </h3>
          {data?.chatsByDept?.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.chatsByDept} dataKey="count" nameKey="name"
                  cx="50%" cy="50%" outerRadius={75} innerRadius={35}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {data.chatsByDept.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-slate-600 text-sm text-center py-16">Chưa có dữ liệu</p>}
        </div>
      </div>

      {/* Recent chats */}
      <div className="card">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Clock size={16} className="text-blue-400" /> Cuộc chat gần đây
        </h3>
        <div className="space-y-1">
          {(data?.recentChats || []).length === 0
            ? <p className="text-slate-600 text-sm text-center py-8">Chưa có cuộc chat</p>
            : (data?.recentChats || []).map(s => (
              <div key={s._id} className="flex items-center gap-3 px-3 py-3 hover:bg-slate-800/60 rounded-xl transition-all">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ background: s.department?.color || '#3B82F6' }}>
                  {s.user?.name?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate font-medium">{s.title}</p>
                  <p className="text-xs text-slate-500">{s.user?.name} · {s.department?.name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-slate-500">{s.totalTokens || 0} tokens</p>
                  {s.createdAt && <p className="text-xs text-slate-700">{format(new Date(s.createdAt), 'dd/MM HH:mm', { locale: vi })}</p>}
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}
