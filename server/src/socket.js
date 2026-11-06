import { randomUUID } from 'node:crypto'
import { rooms } from './rooms.js'
import { getTask, COLORS, updateUserProfile } from './db.js'
import { userFromCookieHeader } from './auth.js'

function sanitizeProfile(p) {
  const nickname = String(p?.nickname ?? '').trim().slice(0, 12)
  const color = COLORS.includes(p?.color) ? p.color : COLORS[Math.floor(Math.random() * COLORS.length)]
  return { nickname: nickname || `干员${randomUUID().slice(0, 4)}`, color }
}

/** socket 当前所在房间（一个连接同一时间只在一个房间） */
function currentRoomOf(socket) {
  for (const room of rooms.rooms.values()) {
    if (room.members.has(socket.id)) return room
  }
  return null
}

export function registerSocketHandlers(io) {
  const updateLobby = () => io.to('lobby').emit('rooms:update', rooms.summaries())

  const roomChannel = (roomId) => `room:${roomId}`

  function detailOf(room) {
    return {
      room: rooms.summary(room),
      task: getTask(room.taskId) ?? null,
      members: rooms.members(room),
      chat: room.chat,
    }
  }

  function updateRoom(room) {
    io.to(roomChannel(room.id)).emit('room:members', {
      room: rooms.summary(room),
      members: rooms.members(room),
    })
    updateLobby()
  }

  function leaveRoom(socket) {
    const room = currentRoomOf(socket)
    if (!room) return
    const member = room.members.get(socket.id)
    const { removed, becameEmpty, newHost } = rooms.removeMember(room, socket.id)
    if (!removed) return
    socket.leave(roomChannel(room.id))
    if (becameEmpty) {
      updateLobby()
      return
    }
    if (newHost) rooms.systemChat(room, `${room.members.get(newHost)?.nickname} 成为新房主`)
    else rooms.systemChat(room, `${member?.nickname ?? '某干员'} 离开了队伍`)
    updateRoom(room)
  }

  // 握手时解析会话 cookie（同源请求自动携带）；游客 socket.data.user 为 null。
  // 会话只在握手时校验一次，断线重连会重新走这里（会话过期则自然降级为游客）。
  io.use((socket, next) => {
    try {
      socket.data.user = userFromCookieHeader(socket.handshake.headers.cookie)
    } catch {
      socket.data.user = null
    }
    next()
  })

  io.on('connection', (socket) => {
    // 登录用户的资料跟账号走；游客才用握手 auth 里的本地资料
    socket.data.profile = socket.data.user
      ? { nickname: socket.data.user.nickname, color: socket.data.user.color }
      : sanitizeProfile(socket.handshake.auth)

    socket.emit('user:profile', socket.data.profile) // 回显规范化后的昵称（如自动生成）

    socket.on('user:profile', (p, ack) => {
      socket.data.profile = sanitizeProfile(p)
      // 登录用户改名/换色同步回账号，换设备登录不丢
      if (socket.data.user) {
        updateUserProfile(socket.data.user.id, socket.data.profile.nickname, socket.data.profile.color)
        socket.data.user = { ...socket.data.user, ...socket.data.profile }
      }
      if (typeof ack === 'function') ack(socket.data.profile)
      const room = currentRoomOf(socket)
      if (room) {
        const m = room.members.get(socket.id)
        if (m) {
          m.nickname = socket.data.profile.nickname
          m.color = socket.data.profile.color
          rooms.systemChat(room, `干员已改名为 ${m.nickname}`)
          updateRoom(room)
        }
      }
    })

    // ---------- 大厅 ----------
    socket.on('lobby:join', () => {
      socket.join('lobby')
      socket.emit('rooms:update', rooms.summaries())
    })
    socket.on('lobby:leave', () => socket.leave('lobby'))

    // ---------- 房间生命周期 ----------
    socket.on('room:create', (payload = {}, ack) => {
      if (!socket.data.user) return ack?.({ ok: false, error: '请先登录后组队', code: 'NEED_LOGIN' })
      if (!getTask(payload.taskId)) return ack?.({ ok: false, error: '关联任务不存在' })
      leaveRoom(socket) // 防御：一个连接同时只在一个房间
      const room = rooms.create(payload, socket.data.profile, socket.id)
      rooms.systemChat(room, `${socket.data.profile.nickname} 创建了队伍，等风来`)
      socket.join(roomChannel(room.id))
      if (typeof ack === 'function') ack({ ok: true, ...detailOf(room) })
      updateLobby()
    })

    socket.on('room:join', ({ roomId } = {}, ack) => {
      if (!socket.data.user) return ack?.({ ok: false, error: '请先登录后加入队伍', code: 'NEED_LOGIN' })
      const room = rooms.get(roomId)
      if (!room) return ack?.({ ok: false, error: '房间不存在或已解散' })
      if (room.members.has(socket.id)) return ack?.({ ok: true, ...detailOf(room) })
      if (room.members.size >= room.maxSize) return ack?.({ ok: false, error: '队伍已满员' })
      leaveRoom(socket)
      const { ok, error } = rooms.join(room, socket.data.profile, socket.id)
      if (!ok) return ack?.({ ok: false, error })
      rooms.systemChat(room, `${socket.data.profile.nickname} 加入了队伍`)
      socket.join(roomChannel(room.id))
      if (typeof ack === 'function') ack({ ok: true, ...detailOf(room) })
      updateRoom(room)
    })

    socket.on('room:leave', () => leaveRoom(socket))

    socket.on('room:close', () => {
      const room = currentRoomOf(socket)
      if (!room || room.hostId !== socket.id) return
      io.to(roomChannel(room.id)).emit('room:closed', { reason: '房主已解散队伍' })
      for (const id of room.members.keys()) io.sockets.sockets.get(id)?.leave(roomChannel(room.id))
      rooms.rooms.delete(room.id)
      updateLobby()
    })

    socket.on('room:kick', ({ target } = {}) => {
      const room = currentRoomOf(socket)
      if (!room || room.hostId !== socket.id || !target || target === socket.id) return
      const member = room.members.get(target)
      if (!member) return
      const targetSocket = io.sockets.sockets.get(target)
      rooms.removeMember(room, target)
      targetSocket?.leave(roomChannel(room.id))
      targetSocket?.emit('room:kicked', { reason: '你已被房主移出队伍' })
      rooms.systemChat(room, `${member.nickname} 被房主移出了队伍`)
      updateRoom(room)
    })

    // ---------- 房间内状态 ----------
    socket.on('room:chat', ({ text } = {}) => {
      const room = currentRoomOf(socket)
      if (!room) return
      const clean = String(text ?? '').trim().slice(0, 500)
      if (!clean) return
      const msg = {
        id: randomUUID().slice(0, 8),
        system: false,
        from: socket.id,
        nickname: socket.data.profile.nickname,
        color: socket.data.profile.color,
        text: clean,
        ts: Date.now(),
      }
      room.chat.push(msg)
      if (room.chat.length > 200) room.chat.splice(0, room.chat.length - 200)
      io.to(roomChannel(room.id)).emit('room:chat', msg)
    })

    // ---------- 语音：状态同步 + WebRTC 信令中继 ----------
    socket.on('voice:state', ({ inVoice, muted } = {}) => {
      const room = currentRoomOf(socket)
      const m = room?.members.get(socket.id)
      if (!m) return
      if (inVoice && !m.inVoice) m.voiceJoinedAt = Date.now()
      m.inVoice = Boolean(inVoice)
      m.muted = Boolean(muted)
      updateRoom(room)
    })

    socket.on('voice:signal', ({ to, kind, payload } = {}) => {
      if (!['offer', 'answer', 'ice'].includes(kind)) return
      const room = currentRoomOf(socket)
      if (!room?.members.has(to)) return // 只中继同房间成员
      io.to(to).emit('voice:signal', { from: socket.id, kind, payload })
    })

    socket.on('disconnect', () => leaveRoom(socket))
  })
}
