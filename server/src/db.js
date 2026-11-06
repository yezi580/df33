import { DatabaseSync } from 'node:sqlite'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const DB_PATH = path.join(DATA_DIR, 'hub.db')

export const db = new DatabaseSync(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id         TEXT PRIMARY KEY,
    season     TEXT NOT NULL,
    mode       TEXT NOT NULL,
    category   TEXT NOT NULL DEFAULT '通用',
    name       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    reward     TEXT NOT NULL DEFAULT '',
    sort       INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    phone      TEXT NOT NULL UNIQUE,
    nickname   TEXT NOT NULL,
    color      TEXT NOT NULL,
    pass_hash  TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
`)

/** 头像色板（前后端一致；auth.js 与 socket.js 共用，放这里避免循环依赖） */
export const COLORS = ['#e6a23c', '#409eff', '#67c23a', '#f56c6c', '#9a6fe0', '#35c2c2', '#e68cc0', '#d4b483']

function seed(force = false) {
  const file = path.join(DATA_DIR, 'tasks.json')
  if (!existsSync(file)) return
  if (force) db.prepare('DELETE FROM tasks').run()
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM tasks').get()
  if (n > 0) return
  const list = JSON.parse(readFileSync(file, 'utf8'))
  const insert = db.prepare(
    'INSERT INTO tasks (id, season, mode, category, name, description, reward, sort) VALUES (?,?,?,?,?,?,?,?)'
  )
  for (const [i, t] of list.entries()) {
    insert.run(t.id, t.season, t.mode, t.category, t.name, t.description, t.reward ?? '', i)
  }
  console.log(`[db] 已从 tasks.json 播种 ${list.length} 个赛季任务`)
}

// 首次运行自动播种；RESEED=1 npm run dev 可在修改 tasks.json 后强制重新播种
seed(process.env.RESEED === '1')

export function listTasks() {
  return db.prepare('SELECT * FROM tasks ORDER BY sort').all()
}

export function getTask(id) {
  // 防御：undefined/null 不能绑定 SQLite 参数
  if (id == null) return null
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) ?? null
}

// ---- 用户与会话（公开形态一律不含 pass_hash）----

const USER_FIELDS = 'id, phone, nickname, color'

export function getUserByPhone(phone) {
  // 登录校验需要密码哈希，内部使用；勿直接下发给客户端
  return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) ?? null
}

export function getUserById(id) {
  return db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`).get(id) ?? null
}

export function createUser({ phone, nickname, color, passHash }) {
  const info = db
    .prepare('INSERT INTO users (phone, nickname, color, pass_hash, created_at) VALUES (?,?,?,?,?)')
    .run(phone, nickname, color, passHash, Date.now())
  return getUserById(info.lastInsertRowid)
}

export function updateUserProfile(id, nickname, color) {
  db.prepare('UPDATE users SET nickname = ?, color = ? WHERE id = ?').run(nickname, color, id)
}

export function createSession(userId, token, expiresAt) {
  // 顺带清理已过期会话，免额外定时器
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)').run(
    token,
    userId,
    Date.now(),
    expiresAt
  )
}

/** token 对应的登录用户；不存在或已过期返回 null */
export function findSessionUser(token) {
  return (
    db
      .prepare(
        `SELECT ${USER_FIELDS} FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > ?`
      )
      .get(token, Date.now()) ?? null
  )
}

export function deleteSession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}
