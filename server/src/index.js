import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import { listTasks } from './db.js'
import { rooms } from './rooms.js'
import { registerSocketHandlers } from './socket.js'
import { authRouter } from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001

const app = express()
app.use(cors())
app.use(express.json())
app.use('/api/auth', authRouter)

app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: rooms.rooms.size }))

// 任务列表 + 每个任务的实时组队统计
app.get('/api/tasks', (_req, res) => {
  const stats = rooms.statsByTask()
  res.json(listTasks().map((t) => ({ ...t, ...(stats[t.id] ?? { roomCount: 0, playerCount: 0, voiceCount: 0 }) })))
})

// 生产模式：托管打包好的前端（client/dist 存在时）；按请求动态判断，支持先启动后打包
const dist = path.join(__dirname, '..', '..', 'client', 'dist')
app.use((req, res, next) => {
  const pageReq = req.method === 'GET' || req.method === 'HEAD'
  if (!pageReq || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return next()
  }
  if (!existsSync(dist)) return next()
  // 带 hash 的资源内容永不变，可永久缓存；HTML 入口禁缓存，保证发版后能立刻拿到新资源引用
  res.setHeader(
    'Cache-Control',
    req.path.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache'
  )
  express.static(dist)(req, res, () => res.sendFile(path.join(dist, 'index.html')))
})

const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })
registerSocketHandlers(io)

httpServer.listen(PORT, () => {
  console.log(`[server] 三角洲组队大厅后端已启动 → http://localhost:${PORT}`)
})
