const http = require('node:http')

const port = Number(process.env.PORT || 3000)
const host = '0.0.0.0'

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ ok: true, app: 'docker-ip-hello', path: req.url, port }))
})

server.listen(port, host, () => {
  console.log(`docker-ip-hello listening on ${host}:${port}`)
})
