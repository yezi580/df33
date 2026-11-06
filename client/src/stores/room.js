import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import router from '../router'
import { socket, emitAck } from '../lib/socket'
import { useVoiceStore } from './voice'

/** 当前所在房间：详情、成员、聊天与全部房间操作 */
export const useRoomStore = defineStore('room', () => {
  const voice = useVoiceStore()

  const roomId = ref(null)
  const room = ref(null) // 房间摘要（名称/人数/状态）
  const task = ref(null) // 关联的赛季任务
  const members = ref([])
  const chat = ref([])
  const me = ref('') // 自己的 socket.id

  const meMember = computed(() => members.value.find((m) => m.id === me.value))
  const isHost = computed(() => Boolean(meMember.value?.isHost))

  function applyDetail(res) {
    roomId.value = res.room.id
    room.value = res.room
    task.value = res.task
    members.value = res.members
    chat.value = res.chat ?? []
    voice.syncMembers(res.members)
  }

  function reset() {
    voice.leave()
    roomId.value = null
    room.value = null
    task.value = null
    members.value = []
    chat.value = []
  }

  // ---- socket 监听（store 首次使用时注册一次）----
  socket.on('connect', () => {
    me.value = socket.id
  })
  if (socket.connected) me.value = socket.id

  socket.on('room:members', ({ room: r, members: list }) => {
    if (r.id !== roomId.value) return
    room.value = r
    members.value = list
    voice.syncMembers(list)
  })

  socket.on('room:chat', (msg) => {
    chat.value.push(msg)
  })

  socket.on('room:closed', ({ reason }) => {
    reset()
    ElMessage.info(reason ?? '房间已解散')
    router.push('/')
  })

  socket.on('room:kicked', ({ reason }) => {
    reset()
    ElMessage.warning(reason ?? '你已被移出队伍')
    router.push('/')
  })

  socket.on('disconnect', () => {
    if (roomId.value) reset()
  })

  // ---- 操作 ----
  async function createRoom(payload) {
    const res = await emitAck('room:create', payload)
    if (res.ok) applyDetail(res)
    return res
  }

  async function joinRoom(id) {
    const res = await emitAck('room:join', { roomId: id })
    if (res.ok) applyDetail(res)
    return res
  }

  function leaveRoom() {
    socket.emit('room:leave')
    reset()
  }

  function sendChat(text) {
    socket.emit('room:chat', { text })
  }

  function kick(id) {
    socket.emit('room:kick', { target: id })
  }

  function closeRoom() {
    socket.emit('room:close')
  }

  return {
    roomId,
    room,
    task,
    members,
    chat,
    me,
    meMember,
    isHost,
    createRoom,
    joinRoom,
    leaveRoom,
    sendChat,
    kick,
    closeRoom,
  }
})
