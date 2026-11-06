// auth + socket 登录门槛冒烟：node server/test/auth-socket-test.mjs
import { io } from 'socket.io-client'

const BASE = process.env.BASE_URL || 'http://localhost:3001'
const PHONE = `139${String(Date.now()).slice(-8)}`

function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`)
    process.exit(1)
  }
  console.log(`✓ ${msg}`)
}

async function register() {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: PHONE,
      password: '123456',
      nickname: '冒烟干员',
      color: '#409eff',
    }),
  })
  const data = await res.json()
  assert(res.ok && data.ok, `注册成功 ${PHONE}`)
  const cookie = res.headers.get('set-cookie').split(';')[0]
  return cookie
}

function connect(cookie) {
  return io(BASE, {
    transports: ['websocket'],
    extraHeaders: cookie ? { Cookie: cookie } : {},
    auth: { nickname: '本地游客名', color: '#e6a23c' }, // 登录后应被账号资料覆盖
  })
}

function emitAck(sock, event, payload) {
  return new Promise((resolve) => {
    sock.timeout(4000).emit(event, payload, (err, res) => resolve(err ? { ok: false, error: 'timeout' } : res))
  })
}

const cookie = await register()

// 取一个真实任务 id 供建房
const tasks = await (await fetch(`${BASE}/api/tasks`)).json()
assert(tasks.length > 0, '任务数据可用')

// 1) 游客建房被拦
const guest = connect(null)
await new Promise((r) => guest.on('connect', r))
const denied = await emitAck(guest, 'room:create', { taskId: tasks[0].id, name: '游客队', maxSize: 3 })
assert(denied.ok === false && denied.code === 'NEED_LOGIN', '游客 room:create 返回 NEED_LOGIN')
guest.close()

// 1b) 无效 taskId 被拒且服务不崩
const sock0 = connect(cookie)
await new Promise((r) => sock0.on('connect', r))
const badTask = await emitAck(sock0, 'room:create', { name: '无任务队', maxSize: 3 })
assert(badTask.ok === false && /任务/.test(badTask.error), '无 taskId 建房被友好拒绝')

// 2) 登录用户建房成功，且成员昵称来自账号（覆盖 handshake auth）
const sock = connect(cookie)
const profile = await new Promise((r) => sock.on('user:profile', r))
assert(profile.nickname === '冒烟干员' && profile.color === '#409eff', '账号资料覆盖 handshake auth')
const created = await emitAck(sock, 'room:create', { taskId: tasks[0].id, name: '账号队', maxSize: 3 })
assert(created.ok && created.members[0].nickname === '冒烟干员', '登录用户建房成功且成员为账号昵称')

// 3) 登录用户改名：ack 回显新昵称（服务端改名不主动推送，靠 ack / room:members 广播）
const updated = await new Promise((r) =>
  sock.emit('user:profile', { nickname: '改名干员', color: '#67c23a' }, r)
)
assert(updated.nickname === '改名干员', '改名回显正常')

// 4) 无效会话 cookie 降级为游客
const fake = connect('df33_sid=' + '0'.repeat(96))
const fakeProfile = await new Promise((r) => fake.on('user:profile', r))
assert(fakeProfile.nickname === '本地游客名', '无效会话降级为游客（用 handshake auth）')

sock0.close()
sock.close()
fake.close()
console.log('全部通过')
process.exit(0)
