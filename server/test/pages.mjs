// 验证：生产模式页面（3001 托管 dist）与 API 并存
const r = await fetch('http://localhost:3001/')
const html = await r.text()
console.log('prod page:', r.status, html.includes('三角洲组队大厅') ? '✅ 标题正确' : '❌ 标题缺失')
const spa = await fetch('http://localhost:3001/room/abc123')
const spaHtml = await spa.text()
console.log('spa fallback:', spa.status, spaHtml.includes('三角洲组队大厅') ? '✅' : '❌')
const api = await fetch('http://localhost:3001/api/tasks')
console.log('api on same origin:', api.status === 200 ? '✅' : '❌')
