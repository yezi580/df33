import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { socket, AVATAR_COLORS } from '../lib/socket'
import { authMe, authLogin, authRegister, authLogout } from '../lib/api'

const NICK_KEY = 'df33.nickname'
const COLOR_KEY = 'df33.color'

export const useUserStore = defineStore('user', () => {
  const nickname = ref(localStorage.getItem(NICK_KEY) || '')
  const color = ref(localStorage.getItem(COLOR_KEY) || '')
  const loggedIn = ref(false)
  const phone = ref('')
  const authVisible = ref(false) // 登录/注册弹窗开关（App.vue 挂载）
  let pendingAction = null // 登录成功后要续做的操作（闭包）

  const hasProfile = computed(() => nickname.value.trim().length > 0)

  // 服务端回显规范化身份（如自动生成的昵称）；登录用户的账号资料也会经此对齐
  socket.on('user:profile', (p) => {
    nickname.value = p.nickname
    color.value = p.color
    localStorage.setItem(NICK_KEY, p.nickname)
    localStorage.setItem(COLOR_KEY, p.color)
  })

  function ensureConnected() {
    if (!socket.connected) socket.connect()
  }

  function saveProfile(name, c) {
    nickname.value = name.trim().slice(0, 12)
    color.value = AVATAR_COLORS.includes(c) ? c : AVATAR_COLORS[0]
    localStorage.setItem(NICK_KEY, nickname.value)
    localStorage.setItem(COLOR_KEY, color.value)
    if (socket.connected) socket.emit('user:profile', { nickname: nickname.value, color: color.value })
  }

  // ---- 账号体系 ----

  function applyUser(u) {
    loggedIn.value = Boolean(u)
    phone.value = u?.phone ?? ''
    if (u) {
      nickname.value = u.nickname
      color.value = u.color
    }
  }

  /** App 启动时恢复登录态；失败按游客处理 */
  async function init() {
    try {
      const res = await authMe()
      applyUser(res.user)
    } catch {
      /* 网络异常按游客处理 */
    }
  }

  /** 需登录操作的统一入口：已登录直做，否则记下续做闭包并弹登录框 */
  function requireLogin(action) {
    if (loggedIn.value) return action()
    pendingAction = action
    authVisible.value = true
  }

  /** 服务端返回 NEED_LOGIN 时（本地登录态误判/会话过期）：纠正状态并弹登录框续做 */
  function onNeedLogin(action) {
    loggedIn.value = false
    requireLogin(action)
  }

  /** 用户放弃登录（关弹窗）时清掉残留闭包 */
  function cancelPending() {
    pendingAction = null
  }

  /** 登录/登出后断开重连：让服务端重新握手（带新 cookie）拿到新身份 */
  function refreshSocket() {
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer)
        socket.off('connect', finish)
        resolve()
      }
      const timer = setTimeout(finish, 4000) // 兜底超时，绝不悬挂
      socket.on('connect', finish)
      socket.disconnect()
      socket.connect()
    })
  }

  /** 注册/登录成功共用：落身份 → 换 socket 身份 → 续做被拦截的操作 */
  async function onAuthed(u) {
    applyUser(u)
    localStorage.setItem(NICK_KEY, u.nickname)
    localStorage.setItem(COLOR_KEY, u.color)
    await refreshSocket()
    const act = pendingAction
    pendingAction = null
    act?.()
  }

  async function login(phoneNo, password) {
    const res = await authLogin(phoneNo, password)
    await onAuthed(res.user)
    return res
  }

  async function register(form) {
    const res = await authRegister(form)
    await onAuthed(res.user)
    return res
  }

  async function logout() {
    await authLogout().catch(() => {})
    applyUser(null)
    await refreshSocket()
  }

  return {
    nickname,
    color,
    hasProfile,
    loggedIn,
    phone,
    authVisible,
    ensureConnected,
    saveProfile,
    init,
    requireLogin,
    onNeedLogin,
    cancelPending,
    login,
    register,
    logout,
  }
})
