import { randomUUID } from 'node:crypto'

const MAX_CHAT_HISTORY = 200

const clampStr = (v, max, fallback = '') => {
  const s = String(v ?? '').trim()
  return (s || fallback).slice(0, max)
}

/**
 * 房间管理器（内存态）。房间是临时实体：人走光了就销毁。
 * member 以 socket.id 为键：{ nickname, color, muted, inVoice, voiceJoinedAt, joinedAt }
 */
export class RoomManager {
  constructor() {
    this.rooms = new Map()
  }

  create({ taskId, name, note, maxSize }, profile, socketId) {
    const room = {
      id: randomUUID().slice(0, 8),
      taskId,
      name: clampStr(name, 30, `${profile.nickname}的队伍`),
      note: clampStr(note, 100),
      maxSize: Math.min(Math.max(Number(maxSize) || 3, 2), 6),
      hostId: socketId,
      members: new Map(),
      chat: [],
      createdAt: Date.now(),
    }
    room.members.set(socketId, this.newMember(profile))
    this.rooms.set(room.id, room)
    return room
  }

  get(id) {
    return this.rooms.get(id)
  }

  newMember(profile) {
    return {
      nickname: profile.nickname,
      color: profile.color,
      muted: false,
      inVoice: false,
      voiceJoinedAt: 0,
      joinedAt: Date.now(),
    }
  }

  join(room, profile, socketId) {
    if (room.members.size >= room.maxSize) return { ok: false, error: 'full' }
    room.members.set(socketId, this.newMember(profile))
    return { ok: true }
  }

  /** 移除成员；返回 {removed, becameEmpty, newHost} */
  removeMember(room, socketId) {
    if (!room.members.delete(socketId)) return { removed: false }
    let newHost = null
    if (room.members.size === 0) {
      this.rooms.delete(room.id)
    } else if (room.hostId === socketId) {
      newHost = room.members.keys().next().value
      room.hostId = newHost
    }
    return { removed: true, becameEmpty: room.members.size === 0, newHost }
  }

  systemChat(room, text) {
    room.chat.push({ id: randomUUID().slice(0, 8), system: true, text, ts: Date.now() })
    if (room.chat.length > MAX_CHAT_HISTORY) room.chat.splice(0, room.chat.length - MAX_CHAT_HISTORY)
  }

  members(room) {
    return [...room.members.entries()].map(([id, m]) => ({
      id,
      nickname: m.nickname,
      color: m.color,
      muted: m.muted,
      inVoice: m.inVoice,
      voiceJoinedAt: m.voiceJoinedAt,
      isHost: id === room.hostId,
    }))
  }

  summary(room) {
    const members = [...room.members.values()]
    return {
      id: room.id,
      taskId: room.taskId,
      name: room.name,
      note: room.note,
      maxSize: room.maxSize,
      createdAt: room.createdAt,
      memberCount: members.length,
      voiceCount: members.filter((m) => m.inVoice).length,
      hostName: room.members.get(room.hostId)?.nickname ?? '—',
    }
  }

  summaries() {
    return [...this.rooms.values()].map((r) => this.summary(r))
  }

  /** 按任务聚合实时统计（大厅展示用） */
  statsByTask() {
    const stats = {}
    for (const room of this.rooms.values()) {
      const s = (stats[room.taskId] ??= { roomCount: 0, playerCount: 0, voiceCount: 0 })
      s.roomCount += 1
      s.playerCount += room.members.size
      s.voiceCount += [...room.members.values()].filter((m) => m.inVoice).length
    }
    return stats
  }
}

export const rooms = new RoomManager()
