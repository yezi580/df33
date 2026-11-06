/**
 * 端到端冒烟测试：模拟两名玩家 完成创建房间→加入→聊天→准备→语音信令中继→踢人→解散 全流程
 * 运行：node test/e2e-test.mjs（需服务端已在 3001 端口启动）
 */
import { io } from 'socket.io-client'

const URL = 'http://localhost:3001'
const results = []
const check = (name, pass, extra = '') => {
  results.push({ name, pass })
  console.log(`${pass ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`)
}

// 登录门槛适配：玩家先注册账号拿会话 cookie，socket 握手带上
async function register(nickname, color) {
  const phone = `13${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 10)}`
  const res = await fetch(`${URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password: '123456', nickname, color }),
  })
  if (!res.ok) throw new Error(`注册失败: ${await res.text()}`)
  return res.headers.get('set-cookie').split(';')[0]
}

function client(cookie) {
  return io(URL, { transports: ['websocket'], extraHeaders: { Cookie: cookie } })
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const once = (socket, event, timeout = 4000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`等待事件 ${event} 超时`)), timeout)
    socket.once(event, (...args) => {
      clearTimeout(t)
      resolve(args)
    })
  })
const emitAck = (socket, event, payload = {}) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${event} ack 超时`)), 4000)
    socket.emit(event, payload, (res) => {
      clearTimeout(t)
      resolve(res)
    })
  })

/** 持续监听直到出现满足条件的事件（避免误消费乱序的旧广播） */
const onceMatch = (socket, event, pred, timeout = 4000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`等待 ${event} 匹配事件超时`)), timeout)
    const handler = (payload) => {
      if (!pred(payload)) return
      clearTimeout(t)
      socket.off(event, handler)
      resolve(payload)
    }
    socket.on(event, handler)
  })

async function main() {
  // REST 检查
  const tasksRes = await fetch(`${URL}/api/tasks`)
  const tasks = await tasksRes.json()
  check('GET /api/tasks 返回任务列表', Array.isArray(tasks) && tasks.length >= 10, `${tasks.length} 个任务`)
  const task = tasks[0]

  const alice = client(await register('Alice', '#e6a23c'))
  const bob = client(await register('Bob', '#409eff'))
  await Promise.all([once(alice, 'connect'), once(bob, 'connect')])

  // 大厅订阅
  alice.emit('lobby:join')
  const [rooms1] = await once(alice, 'rooms:update')
  check('大厅订阅 rooms:update', Array.isArray(rooms1))

  // Alice 创建房间
  const created = await emitAck(alice, 'room:create', { taskId: task.id, name: '测试小队', note: 'e2e', maxSize: 3 })
  check('Alice 创建房间', created.ok && created.room.name === '测试小队')
  const roomId = created.room.id
  check('创建后返回任务详情', created.task?.id === task.id)

  // 广播房间列表更新（新订阅者立即收到当前房间列表）
  bob.emit('lobby:join')
  const [rooms2] = await once(bob, 'rooms:update')
  check('大厅房间列表含新房间', rooms2.some((r) => r.id === roomId && r.memberCount === 1))

  // Bob 加入
  const joined = await emitAck(bob, 'room:join', { roomId })
  check('Bob 加入房间', joined.ok && joined.members.length === 2)

  // 满员测试：Carol 加入（maxSize=3，第 3 人成功，第 4 人失败）
  const carol = client(await register('Carol', '#67c23a'))
  await once(carol, 'connect')
  const joined3 = await emitAck(carol, 'room:join', { roomId })
  check('Carol 加入（3/3 满）', joined3.ok && joined3.members.length === 3)
  const dave = client(await register('Dave', '#f56c6c'))
  await once(dave, 'connect')
  const joined4 = await emitAck(dave, 'room:join', { roomId })
  check('Dave 被拒绝（已满）', joined4.ok === false && joined4.error === '队伍已满员')
  dave.close()

  // 聊天
  const chatWait = once(carol, 'room:chat')
  alice.emit('room:chat', { text: '集合了兄弟们' })
  const [msg] = await chatWait
  check('聊天广播', msg.text === '集合了兄弟们' && msg.nickname === 'Alice')

  // 语音状态
  const voiceWait = once(alice, 'room:members')
  bob.emit('voice:state', { inVoice: true, muted: false })
  const [{ members: membersVoice }] = await voiceWait
  check('语音状态同步', membersVoice.find((m) => m.nickname === 'Bob')?.inVoice === true)

  // WebRTC 信令中继：Bob -> Alice 的 offer 被转发
  const signalWait = once(alice, 'voice:signal')
  bob.emit('voice:signal', { to: alice.id, kind: 'offer', payload: { type: 'offer', sdp: 'test-sdp' } })
  const [sig] = await signalWait
  check('语音信令中继', sig.from === bob.id && sig.kind === 'offer' && sig.payload.sdp === 'test-sdp')

  // 跨房间信令拒绝：Dave（不在房间）无法向 Alice 发信令
  const dave2 = client(null)
  await once(dave2, 'connect')
  let signalLeak = null
  alice.once('voice:signal', () => (signalLeak = true))
  dave2.emit('voice:signal', { to: alice.id, kind: 'offer', payload: { type: 'offer', sdp: 'evil' } })
  await wait(500)
  check('外部信令被拒绝', signalLeak === null)

  // 房主踢人
  const kickedWait = once(carol, 'room:kicked')
  alice.emit('room:kick', { target: carol.id })
  const [kickInfo] = await kickedWait
  check('踢人通知', kickInfo?.reason?.includes('移出'))

  // 房主转移：Alice 断线 → Bob（最早加入）成为房主
  const hostGone = onceMatch(
    bob,
    'room:members',
    (p) => p.members.length === 1 && p.members[0].nickname === 'Bob'
  )
  alice.close()
  const { members: membersAfterDC } = await hostGone
  check('房主转移', membersAfterDC.find((m) => m.nickname === 'Bob')?.isHost === true)

  // 解散
  const closedWait = once(bob, 'room:closed')
  bob.emit('room:close')
  await closedWait
  check('房主解散房间', true)

  // 状态重置验证
  const joinDead = await emitAck(bob, 'room:join', { roomId })
  check('解散后加入失败', joinDead.ok === false)

  bob.close()
  carol.close()
  dave2.close()

  const failed = results.filter((r) => !r.pass)
  console.log(`\n===== 结果：${results.length - failed.length}/${results.length} 通过 =====`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error('💥 测试异常:', e.message)
  process.exit(1)
})
