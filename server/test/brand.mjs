// 验证：新品牌标识 DF33 已生效（开发页源码 + 生产页源码）
const dev = await fetch('http://localhost:5173/src/App.vue')
const devSrc = await dev.text()
console.log('dev App.vue 含 DF33:', devSrc.includes('DF33') ? '✅' : '❌')
console.log('dev App.vue 无 DSH 残留:', devSrc.includes('>DSH<') ? '❌' : '✅')
const prod = await fetch('http://localhost:3001/')
const prodHtml = await prod.text()
const bundle = prodHtml.match(/assets\/index-[\w-]+\.js/)?.[0]
const js = await fetch('http://localhost:3001/' + bundle)
const jsText = await js.text()
console.log('prod bundle 含 DF33:', jsText.includes('DF33') ? '✅' : '❌')
console.log('prod bundle 无 DSH 残留:', jsText.includes('"DSH"') ? '❌' : '✅')
