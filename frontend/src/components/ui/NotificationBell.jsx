import { useState, useEffect, useRef } from "react";
import { Bell, X, Check, CheckCheck } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import api from "../../services/api";
import clsx from "clsx";

const typeColors = {
  new_document: "bg-blue-500",
  document_indexed: "bg-green-500",
  chat_summary: "bg-purple-500",
  system: "bg-gray-500",
  password_reset: "bg-orange-500",
  user_created: "bg-teal-500"
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);

  const fetchNotifications = async () => {
    try {
      const { data } = await api.get("/notifications?limit=15");
      setNotifications(data.notifications);
      setUnread(data.unreadCount);
    } catch {}
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markRead = async (id) => {
    await api.patch(`/notifications/${id}/read`);
    setNotifications(n => n.map(x => x._id === id ? { ...x, isRead: true } : x));
    setUnread(u => Math.max(0, u - 1));
  };

  const markAll = async () => {
    await api.patch("/notifications/read-all");
    setNotifications(n => n.map(x => ({ ...x, isRead: true })));
    setUnread(0);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="relative p-2 text-dark-400 hover:text-white hover:bg-dark-800 rounded-lg transition-all">
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-dark-900 border border-dark-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700">
            <h3 className="font-semibold text-white text-sm">Thông báo</h3>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={markAll} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
                  <CheckCheck size={14} /> Đọc hết
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-dark-500 text-sm">Không có thông báo</div>
            ) : (
              notifications.map(n => (
                <div key={n._id} onClick={() => !n.isRead && markRead(n._id)}
                  className={clsx("flex gap-3 px-4 py-3 border-b border-dark-800 cursor-pointer hover:bg-dark-800 transition-colors",
                    !n.isRead && "bg-dark-800/50")}>
                  <div className={clsx("w-2 h-2 rounded-full flex-shrink-0 mt-1.5", typeColors[n.type] || "bg-gray-500")} />
                  <div className="flex-1 min-w-0">
                    <p className={clsx("text-sm font-medium truncate", n.isRead ? "text-dark-300" : "text-white")}>{n.title}</p>
                    <p className="text-xs text-dark-500 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-xs text-dark-600 mt-1">
                      {format(new Date(n.createdAt), "dd MMM, HH:mm", { locale: vi })}
                    </p>
                  </div>
                  {!n.isRead && <div className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0 mt-1.5" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
