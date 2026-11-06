import { Router } from 'express'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import {
  COLORS,
  getUserByPhone,
  createUser,
  createSession,
  findSessionUser,
  deleteSession,
} from './db.js'

/** 手机号账号体系：注册（手机号+密码+干员代号）、登录、登出、会话查询 */
const PHONE_RE = /^1[3-9]\d{9}$/
const NICK_MAX = 12
export const SESSION_COOKIE = 'df33_sid'
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

// ---- 密码哈希：scrypt（salt:hash 均 hex）----

export function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(plain), salt, 64, SCRYPT).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(plain, stored) {
  const [salt, hash] = String(stored || '').split(':')
  if (!salt || !hash) return false
  // keylen 取存量 hash 的字节数；timingSafeEqual 长度不等会 throw，先比长度
  const calc = scryptSync(String(plain), salt, hash.length / 2, SCRYPT)
  const expect = Buffer.from(hash, 'hex')
  return calc.length === expect.length && timingSafeEqual(calc, expect)
}

// ---- cookie 解析（token 为 hex，无需 decodeURIComponent）----

export function parseCookies(header = '') {
  const out = {}
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

/** 从 Cookie 头解析登录用户；游客/会话过期返回 null。socket 握手与 /me 共用 */
export function userFromCookieHeader(header) {
  const token = parseCookies(header)[SESSION_COOKIE]
  return token ? findSessionUser(token) : null
}

// ---- 路由 ----

export const authRouter = Router()

function startSession(res, userId) {
  const token = randomBytes(48).toString('hex')
  createSession(userId, token, Date.now() + SESSION_TTL_MS)
  // 上 HTTPS 后应追加 Secure 标记
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`
  )
}

/** 注册资料规范化校验；不合法返回错误文案 */
function validate({ phone, password, nickname, color }) {
  if (!PHONE_RE.test(String(phone ?? ''))) return '请输入正确的手机号'
  const pwd = String(password ?? '')
  if (pwd.length < 6 || pwd.length > 12) return '密码需为 6-12 位'
  const nick = String(nickname ?? '').trim().slice(0, NICK_MAX)
  if (!nick) return '请先给自己起个代号'
  if (!COLORS.includes(color)) return '请选择头像颜色'
  return null
}

authRouter.post('/register', (req, res) => {
  const err = validate(req.body ?? {})
  if (err) return res.status(400).json({ ok: false, error: err })
  const { phone, password } = req.body
  const nickname = String(req.body.nickname).trim().slice(0, NICK_MAX)
  if (getUserByPhone(phone)) {
    return res.status(400).json({ ok: false, error: '该手机号已注册，可直接登录' })
  }
  const user = createUser({ phone, nickname, color: req.body.color, passHash: hashPassword(password) })
  startSession(res, user.id)
  res.json({ ok: true, user })
})

authRouter.post('/login', (req, res) => {
  const { phone, password } = req.body ?? {}
  if (!PHONE_RE.test(String(phone ?? '')) || String(password ?? '').length < 6) {
    return res.status(401).json({ ok: false, error: '手机号或密码不正确' })
  }
  const user = getUserByPhone(phone)
  // 用户不存在也跑一次哑校验，拉平耗时防时序探测
  const ok = verifyPassword(password ?? '', user?.pass_hash ?? '0:0')
  if (!user || !ok) return res.status(401).json({ ok: false, error: '手机号或密码不正确' })
  startSession(res, user.id)
  res.json({ ok: true, user: { id: user.id, phone: user.phone, nickname: user.nickname, color: user.color } })
})

authRouter.post('/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (token) deleteSession(token)
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
  res.json({ ok: true })
})

authRouter.get('/me', (req, res) => {
  // 未登录返回 user:null（而非 401），省客户端错误分支
  res.json({ ok: true, user: userFromCookieHeader(req.headers.cookie) })
})
