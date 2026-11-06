/**
 * WebRTC ICE 服务器配置。
 * 局域网 / 本机测试：无需 STUN 也能直连。
 * 公网部署：国内环境下建议保留腾讯 / 小米 STUN；若队友间 NAT 严格导致连不上，
 * 需要自建 coturn TURN 服务器后追加 { urls: 'turn:...', username: ..., credential: ... }。
 */
export const ICE_SERVERS = [
  { urls: ['stun:stun.qq.com:3478', 'stun:stun.miwifi.com:3478'] },
  { urls: 'stun:stun.l.google.com:19302' },
]
