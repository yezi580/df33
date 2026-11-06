/** 统一请求封装：同源 fetch 自动携带 cookie；!res.ok 或业务 ok:false 时抛中文 Error */
async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new Error(data.error || '请求失败')
  return data
}

export async function fetchTasks() {
  const res = await fetch('/api/tasks')
  if (!res.ok) throw new Error('任务列表加载失败')
  return res.json()
}

export const authMe = () => request('/api/auth/me')
export const authLogin = (phone, password) =>
  request('/api/auth/login', { method: 'POST', body: { phone, password } })
export const authRegister = (form) =>
  request('/api/auth/register', { method: 'POST', body: form })
export const authLogout = () => request('/api/auth/logout', { method: 'POST' })
