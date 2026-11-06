import { io } from 'socket.io-client'

/** 头像色板（与服务端保持一致） */
export const AVATAR_COLORS = [
  '#e6a23c',
  '#409eff',
  '#67c23a',
  '#f56c6c',
  '#9a6fe0',
  '#35c2c2',
  '#e68cc0',
  '#d4b483',
]

/**
 * 全局唯一 Socket 连接。auth 用函数形式，每次连接时从 localStorage 读取最新身份。
 * 开发环境经 Vite 代理转发到 3001，生产环境同源直连。
 */
export const socket = io({
  autoConnect: false,
  auth: (cb) =>
    cb({
      nickname: localStorage.getItem('df33.nickname') || '',
      color: localStorage.getItem('df33.color') || '',
    }),
})

/** 带超时的 ack 请求封装 */
export function emitAck(event, payload = {}, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let done = false
    const timer = setTimeout(() => {
      if (!done) {
        done = true
        resolve({ ok: false, error: '请求超时，请检查网络连接' })
      }
    }, timeoutMs)
    socket.emit(event, payload, (res) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(res ?? { ok: false, error: '服务响应异常' })
    })
  })
}
