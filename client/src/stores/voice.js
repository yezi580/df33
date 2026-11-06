import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import { socket } from '../lib/socket'
import { ICE_SERVERS } from '../lib/rtc'

const PREFS_KEY = 'df33-voice-prefs'
const DEFAULT_PREFS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  micVolume: 1, // 说话音量 0..2（发给队友前的增益）
  listenVolume: 1, // 收听音量 0..1（所有队友播放的总音量）
}
const loadPrefs = () => {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

/** 提高 Opus 编码码率（浏览器默认语音码率偏低，听感发闷） */
function boostOpusBitrate(desc) {
  const m = desc.sdp.match(/a=rtpmap:(\d+) opus\/48000/i)
  if (!m) return desc
  const pt = m[1]
  const fmtp = `a=fmtp:${pt} useinbandfec=1;maxaveragebitrate=131072` // 128kbps
  const fmtpRe = new RegExp(`a=fmtp:${pt}[^\\r\\n]*`)
  if (fmtpRe.test(desc.sdp)) {
    desc.sdp = desc.sdp.replace(fmtpRe, (line) =>
      line.replace(/;(maxaveragebitrate|useinbandfec)=[^;]*/gi, '') + ';useinbandfec=1;maxaveragebitrate=131072'
    )
  } else {
    desc.sdp = desc.sdp.replace(
      new RegExp(`(a=rtpmap:${pt} opus/48000/2[^\\r\\n]*)`),
      `$1\r\n${fmtp}`
    )
  }
  return desc
}

/**
 * WebRTC P2P 网状语音引擎。
 * 连接规则：后加入语音的人（voiceJoinedAt 较大）向已在语音中的人发起 offer，
 * 双方时间戳由服务端广播、全局一致，避免双方同时出价（glare）。
 */
export const useVoiceStore = defineStore('voice', () => {
  const joined = ref(false)
  const connecting = ref(false)
  const muted = ref(false)
  const error = ref('')
  const levels = reactive({}) // socketId | 'self' -> 0..1 音量
  const connectedIds = ref([]) // 已连通的对端
  const prefs = reactive(loadPrefs()) // 音频处理开关 + 音量偏好（跨会话保留）
  const peerVolumes = reactive({}) // peerId -> 0..1 每个队友的独立收听音量（会话内有效）

  // 非响应式内部状态
  let localStream = null // 原始麦克风流
  let sendStream = null // 增益处理后发给队友的流
  let micGain = null // 说话音量增益节点
  let audioCtx = null
  let rafId = 0
  let myVoiceJoinedAt = 0
  let memberSnapshot = []
  const pcs = new Map() // peerId -> RTCPeerConnection
  const analysers = new Map() // streamKey -> { analyser, data }
  const audios = new Map() // peerId -> HTMLAudioElement

  const peerCount = computed(() => connectedIds.value.length)

  function send(to, kind, payload) {
    socket.emit('voice:signal', { to, kind, payload })
  }

  // ---------- 音量检测 ----------
  function attachAnalyser(key, streamOrNode) {
    if (!audioCtx || analysers.has(key)) return
    const src =
      streamOrNode instanceof MediaStream
        ? audioCtx.createMediaStreamSource(streamOrNode)
        : streamOrNode
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.55
    src.connect(analyser)
    analysers.set(key, { analyser, data: new Uint8Array(analyser.frequencyBinCount) })
  }

  function startLevelLoop() {
    const tick = () => {
      for (const [key, { analyser, data }] of analysers) {
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
        const rms = Math.sqrt(sum / data.length) / 128
        levels[key] = Math.min(1, rms * 2.8)
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
  }

  // ---------- PeerConnection ----------
  function createPc(peerId) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pc._pendingIce = []

    pc.onicecandidate = (e) => {
      if (e.candidate) send(peerId, 'ice', e.candidate.toJSON())
    }

    pc.ontrack = (e) => {
      const [stream] = e.streams
      attachAnalyser(peerId, stream)
      let audio = audios.get(peerId)
      if (!audio || audio.srcObject !== stream) {
        audio?.remove()
        audio = new Audio()
        audio.autoplay = true
        audio.srcObject = stream
        audio.volume = prefs.listenVolume * (peerVolumes[peerId] ?? 1)
        audios.set(peerId, audio)
      }
      audio.play().catch(() => {}) // 已由「加入语音」点击手势解锁自动播放
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        if (!connectedIds.value.includes(peerId)) connectedIds.value.push(peerId)
      } else {
        connectedIds.value = connectedIds.value.filter((id) => id !== peerId)
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') teardownPeer(peerId)
      }
    }

    const outStream = sendStream ?? localStream
    outStream?.getTracks().forEach((t) => pc.addTrack(t, outStream))
    pcs.set(peerId, pc)
    return pc
  }

  async function connectTo(peerId, initiator) {
    if (pcs.has(peerId)) return
    const pc = createPc(peerId)
    if (initiator) {
      const offer = await pc.createOffer()
      boostOpusBitrate(offer)
      await pc.setLocalDescription(offer)
      send(peerId, 'offer', offer)
    }
  }

  async function drainIce(pc) {
    const list = pc._pendingIce ?? []
    pc._pendingIce = []
    for (const c of list) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
  }

  async function handleSignal({ from, kind, payload }) {
    if (!joined.value || from === socket.id) return
    try {
      if (kind === 'offer') {
        let pc = pcs.get(from)
        if (pc && pc.signalingState !== 'stable') return // glare 罕见竞态：按时间戳规则忽略
        pc = pc ?? createPc(from)
        await pc.setRemoteDescription(new RTCSessionDescription(payload))
        await drainIce(pc)
        const answer = await pc.createAnswer()
        boostOpusBitrate(answer)
        await pc.setLocalDescription(answer)
        send(from, 'answer', answer)
      } else if (kind === 'answer') {
        const pc = pcs.get(from)
        if (pc && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload))
          await drainIce(pc)
        }
      } else if (kind === 'ice') {
        const pc = pcs.get(from)
        if (!pc) return
        if (!pc.remoteDescription) pc._pendingIce.push(payload)
        else await pc.addIceCandidate(new RTCIceCandidate(payload)).catch(() => {})
      }
    } catch (e) {
      console.warn('[voice] 信令处理异常', kind, e)
    }
  }

  socket.on('voice:signal', handleSignal)
  socket.on('disconnect', () => {
    cleanup()
    joined.value = false
    muted.value = false
  })

  // ---------- 成员变化 → 同步网格连接 ----------
  function syncMembers(list) {
    memberSnapshot = list ?? []
    if (!joined.value) return
    const active = new Set(
      memberSnapshot.filter((m) => m.inVoice && m.id !== socket.id).map((m) => m.id)
    )
    for (const id of [...pcs.keys()]) if (!active.has(id)) teardownPeer(id)
    for (const m of memberSnapshot) {
      if (m.inVoice && m.id !== socket.id && !pcs.has(m.id)) {
        connectTo(m.id, myVoiceJoinedAt > (m.voiceJoinedAt || 0))
      }
    }
  }

  // ---------- 加入 / 离开 / 静音 ----------
  async function join() {
    if (joined.value || connecting.value) return true
    connecting.value = true
    error.value = ''
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { ...prefs, channelCount: 1, sampleRate: 48000 },
      })
      audioCtx = new AudioContext()
      await audioCtx.resume().catch(() => {})
      // 麦克风 → 增益（说话音量）→ 发送流；电平检测挂在增益后，显示队友实际听到的音量
      const srcNode = audioCtx.createMediaStreamSource(localStream)
      micGain = audioCtx.createGain()
      micGain.gain.value = prefs.micVolume
      const dest = audioCtx.createMediaStreamDestination()
      srcNode.connect(micGain)
      micGain.connect(dest)
      sendStream = dest.stream
      attachAnalyser('self', micGain)
      startLevelLoop()
      myVoiceJoinedAt = Date.now()
      joined.value = true
      socket.emit('voice:state', { inVoice: true, muted: muted.value })
      // 作为新加入者，主动连接所有已在语音中的成员
      for (const m of memberSnapshot) {
        if (m.id !== socket.id && m.inVoice) connectTo(m.id, true)
      }
      return true
    } catch (e) {
      error.value =
        e?.name === 'NotAllowedError'
          ? '麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试'
          : `无法访问麦克风：${e?.message ?? e}`
      cleanup()
      return false
    } finally {
      connecting.value = false
    }
  }

  function leave() {
    if (joined.value) socket.emit('voice:state', { inVoice: false, muted: false })
    cleanup()
    joined.value = false
    muted.value = false
  }

  function toggleMute() {
    if (!joined.value) return
    muted.value = !muted.value
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted.value))
    socket.emit('voice:state', { inVoice: true, muted: muted.value })
  }

  /** 切换音频处理开关；采集已在进行时尝试实时应用（Chrome 支持），失败则下次加入语音生效 */
  async function setPref(key, value) {
    prefs[key] = value
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    const track = localStream?.getAudioTracks()[0]
    if (!track) return true
    try {
      await track.applyConstraints({ [key]: value })
      return true
    } catch {
      return false // 当前设备不支持实时切换
    }
  }

  /** 说话音量 0..2：发给队友前的增益 */
  function setMicVolume(v) {
    prefs.micVolume = v
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    if (micGain) micGain.gain.value = v
  }

  /** 收听音量 0..1：所有队友播放的总音量 */
  function setListenVolume(v) {
    prefs.listenVolume = v
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    for (const [id, audio] of audios) audio.volume = v * (peerVolumes[id] ?? 1)
  }

  /** 单个队友的独立音量 0..1（会话内有效） */
  function setPeerVolume(peerId, v) {
    peerVolumes[peerId] = v
    const audio = audios.get(peerId)
    if (audio) audio.volume = prefs.listenVolume * v
  }

  // ---------- 清理 ----------
  function teardownPeer(id) {
    pcs.get(id)?.close()
    pcs.delete(id)
    audios.get(id)?.remove()
    audios.delete(id)
    analysers.delete(id)
    delete levels[id]
    connectedIds.value = connectedIds.value.filter((x) => x !== id)
  }

  function cleanup() {
    cancelAnimationFrame(rafId)
    rafId = 0
    for (const id of [...pcs.keys()]) teardownPeer(id)
    localStream?.getTracks().forEach((t) => t.stop())
    localStream = null
    sendStream = null
    micGain = null
    if (audioCtx && audioCtx.state !== 'closed') audioCtx.close().catch(() => {})
    audioCtx = null
    analysers.clear()
    for (const k of Object.keys(levels)) delete levels[k]
    for (const k of Object.keys(peerVolumes)) delete peerVolumes[k]
  }

  return {
    joined,
    connecting,
    muted,
    error,
    levels,
    peerCount,
    prefs,
    peerVolumes,
    join,
    leave,
    toggleMute,
    setPref,
    setMicVolume,
    setListenVolume,
    setPeerVolume,
    syncMembers,
  }
})
