import useAuthStore from '../store/authStore'
import { API_BASE_URL } from './config'

const post = (url, body, signal) => {
  const { accessToken } = useAuthStore.getState()
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  })
}

/**
 * Gửi tin nhắn và nhận câu trả lời dạng SSE.
 * Callbacks: onStatus('understanding'|'searching'|'reading'|'writing'), onDelta(text).
 * Trả về payload `done` { sources, userMessage, assistantMessage }.
 * Huỷ bằng AbortController.signal → ném DOMException name === 'AbortError'.
 */
export async function streamMessage(sessionId, message, { signal, onStatus, onDelta } = {}) {
  const url = `${API_BASE_URL}/chat/sessions/${sessionId}/message/stream`
  let res = await post(url, { message }, signal)

  // Access token hết hạn → refresh 1 lần rồi gửi lại (axios interceptor không áp dụng cho fetch)
  if (res.status === 401) {
    const body = await res.clone().json().catch(() => ({}))
    if (body.code === 'TOKEN_EXPIRED') {
      try { await useAuthStore.getState().refreshAccessToken() }
      catch { sessionStorage.removeItem('tttn-auth'); window.location.href = '/login'; throw new Error('Phiên đăng nhập đã hết hạn') }
      res = await post(url, { message }, signal)
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Gửi thất bại. Vui lòng thử lại.')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let final = null

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let idx
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const line = block.split('\n').find(l => l.startsWith('data:'))
      if (!line) continue
      let ev
      try { ev = JSON.parse(line.slice(5).trim()) } catch { continue }

      if (ev.error) throw new Error(ev.error)
      if (ev.status) onStatus?.(ev.status)
      if (ev.delta) onDelta?.(ev.delta)
      if (ev.done) final = ev
    }
  }

  if (!final) throw new Error('Kết nối bị gián đoạn, vui lòng thử lại.')
  return final
}
