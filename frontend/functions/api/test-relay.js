import { connect } from 'cloudflare:sockets'
import bcrypt from 'bcryptjs'
import forge from 'node-forge'

const PROXY_HOST = 'sonfishing.iptime.org'
const PROXY_PORT = 5800
const NAVER_HOST = 'api.commerce.naver.com'
const NAVER_PORT = 443

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const start = Date.now()
  const diag = {}
  let testsPassed = false

  try {
    // 1) DNS & HTTP reachability test
    try {
      const dnsRes = await fetch('https://dns.google/resolve?name=' + PROXY_HOST + '&type=A')
      const dnsJson = await dnsRes.json()
      diag.dns = dnsJson.Answer ? dnsJson.Answer.map(a => a.data) : 'no A records'
    } catch (e) {
      diag.dns = 'DNS lookup error: ' + e.message
    }

    // 2) Try simple HTTP fetch to proxy port
    try {
      const httpTest = await fetch('http://' + PROXY_HOST + ':' + PROXY_PORT + '/', { method: 'GET', signal: AbortSignal.timeout(5000) })
      diag.httpTest = { status: httpTest.status, body: (await httpTest.text()).substring(0, 200) }
    } catch (e) {
      diag.httpTest = 'HTTP fetch error: ' + e.message
    }

    // 3) Try connect() to proxy
    try {
      const socket = connect({ hostname: PROXY_HOST, port: PROXY_PORT })
      const sw = socket.writable.getWriter()
      await sw.write(new TextEncoder().encode(
        `CONNECT ${NAVER_HOST}:${NAVER_PORT} HTTP/1.1\r\nHost: ${NAVER_HOST}:${NAVER_PORT}\r\n\r\n`
      ))
      sw.releaseLock()

      const sr = socket.readable.getReader()
      let resp = ''
      const timeout = setTimeout(() => { socket.close(); diag.connectTest = 'TIMEOUT' }, 10000)
      while (true) {
        const { value, done } = await sr.read()
        if (done) break
        resp += new TextDecoder().decode(value)
        if (resp.includes('\r\n\r\n')) break
      }
      clearTimeout(timeout)
      sr.releaseLock()

      diag.connectTest = { ok: resp.includes('200'), response: resp.substring(0, 200) }

      if (!resp.includes('200 Connection established')) {
        socket.close()
        return new Response(JSON.stringify({ success: false, message: 'CONNECT failed', diag }), {
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        })
      }

      // 4) forge TLS handshake
      let plaintext = ''
      let pending = null
      const tls = forge.tls.createConnection({
        server: [],
        verify: () => true,
        connected: () => {},
        getData: (c, data) => {
          plaintext += data.getBytes()
          const hp = plaintext.indexOf('\r\n\r\n')
          if (hp !== -1 && pending) {
            const hs = plaintext.substring(0, hp)
            const bs = hp + 4
            const cm = hs.match(/Content-Length:\s*(\d+)/i)
            if (cm && plaintext.substring(bs).length >= parseInt(cm[1])) {
              pending.resolve({ statusCode: parseInt(hs.split(' ')[1]), body: plaintext.substring(bs).trim() })
              pending = null
            } else if (!cm) {
              pending.resolve({ statusCode: parseInt(hs.split(' ')[1]), body: plaintext.substring(bs).trim() })
              pending = null
            }
          }
        },
        tlsDataReady: (c, data) => {
          socket.writable.getWriter().then(w => w.write(new Uint8Array(data)).then(() => w.releaseLock()))
        },
        closed: () => { if (pending) { pending.resolve({ statusCode: 0, body: plaintext }); pending = null } },
        error: (c, error) => { if (pending) { pending.reject(new Error(error.message)); pending = null } },
        getServerName: () => NAVER_HOST
      })
      tls.handshake()

      ;(async () => {
        const r = socket.readable.getReader()
        while (true) {
          const { value, done } = await r.read()
          if (done) break
          tls.process(value)
        }
        r.releaseLock()
      })()

      // Send token request
      const clientId = env.CLIENT_ID
      const clientSecret = env.CLIENT_SECRET
      const timestamp = String(Date.now())
      const password = clientId + '_' + timestamp
      const hashed = bcrypt.hashSync(password, clientSecret)
      const clientSecretSign = btoa(hashed)

      const body = new URLSearchParams({
        client_id: clientId, timestamp,
        client_secret_sign: clientSecretSign,
        grant_type: 'client_credentials', type: 'SELF'
      }).toString()

      let req = 'POST /external/v1/oauth2/token HTTP/1.1\r\nHost: ' + NAVER_HOST + '\r\n'
      req += 'Content-Type: application/x-www-form-urlencoded\r\n'
      req += 'Content-Length: ' + new TextEncoder().encode(body).length + '\r\n'
      req += 'Connection: close\r\n\r\n' + body

      const tokenResult = await Promise.race([
        new Promise((resolve, reject) => { pending = { resolve, reject }; tls.prepare(req) }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Token timeout')), 30000))
      ])
      diag.token = { statusCode: tokenResult.statusCode, body: tokenResult.body.substring(0, 300) }

      socket.close()
      testsPassed = true
    } catch (e) {
      diag.connectTest = 'connect() error: ' + e.message
    }

    return new Response(JSON.stringify({
      success: testsPassed,
      elapsed: (Date.now() - start) + 'ms',
      diag
    }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
  } catch (e) {
    return new Response(JSON.stringify({
      success: false, message: 'EXCEPTION: ' + e.message, diag
    }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
  }
}
