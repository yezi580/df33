const r = await fetch('http://localhost:3001/api/health')
console.log('health:', r.status, await r.text())
process.exit(0)
