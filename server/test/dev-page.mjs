// 验证：Vite 开发服务器（5173）页面与 API 代理
const r = await fetch('http://localhost:5173/')
const html = await r.text()
console.log('dev page:', r.status, html.includes('/src/main.js') ? '✅ Vite 入口正常' : '❌')
const api = await fetch('http://localhost:5173/api/health')
console.log('api proxy:', api.status === 200 ? '✅ /api 代理到 3001' : '❌ ' + api.status)
