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

async function tunneledRequest(method, path, headers, body) {
  const socket = connect({ hostname: PROXY_HOST, port: PROXY_PORT })

  const sw = socket.writable.getWriter()
  await sw.write(new TextEncoder().encode(
    `CONNECT ${NAVER_HOST}:${NAVER_PORT} HTTP/1.1\r\nHost: ${NAVER_HOST}:${NAVER_PORT}\r\n\r\n`
  ))
  sw.releaseLock()

  const sr = socket.readable.getReader()
  let connectResp = ''
  while (true) {
    const { value, done } = await sr.read()
    if (done) break
    connectResp += new TextDecoder().decode(value)
    if (connectResp.includes('\r\n\r\n')) break
  }
  sr.releaseLock()

  if (!connectResp.includes('200 Connection established')) {
    socket.close()
    return { statusCode: 0, body: 'CONNECT_FAILED: ' + connectResp }
  }

  let plaintext = ''
  let pendingResolve = null
  let pendingReject = null

  const tls = forge.tls.createConnection({
    server: [],
    verify: () => true,
    connected: () => {},
    getData: (c, data) => {
      plaintext += data.getBytes()
      const hp = plaintext.indexOf('\r\n\r\n')
      if (hp !== -1 && pendingResolve) {
        const hs = plaintext.substring(0, hp)
        const bs = hp + 4
        const cm = hs.match(/Content-Length:\s*(\d+)/i)
        if (cm && plaintext.substring(bs).length >= parseInt(cm[1])) {
          const sc = parseInt(hs.split(' ')[1])
          pendingResolve({ statusCode: sc, body: plaintext.substring(bs).trim() })
          pendingResolve = null
        } else if (!cm) {
          const sc = parseInt(hs.split(' ')[1])
          pendingResolve({ statusCode: sc, body: plaintext.substring(bs).trim() })
          pendingResolve = null
        }
      }
    },
    tlsDataReady: (c, data) => {
      const w = socket.writable.getWriter()
      w.write(new Uint8Array(data)).then(() => w.releaseLock())
    },
    closed: () => {
      if (pendingResolve) {
        pendingResolve({ statusCode: 0, body: plaintext })
        pendingResolve = null
      }
    },
    error: (c, error) => {
      if (pendingReject) {
        pendingReject(new Error('TLS_ERR: ' + error.message))
        pendingReject = null
      }
    },
    getServerName: () => NAVER_HOST
  })

  tls.handshake()

  ;(async () => {
    const r = socket.readable.getReader()
    while (true) {
      const { value, done } = await r.read()
      if (done) break
      try { tls.process(value) } catch (e) {
        if (pendingReject) {
          pendingReject(new Error('TLS_PROCESS_ERR: ' + e.message))
          pendingReject = null
        }
      }
    }
    r.releaseLock()
  })()

  let req = `${method} ${path} HTTP/1.1\r\nHost: ${NAVER_HOST}\r\n`
  for (const [k, v] of Object.entries(headers)) req += `${k}: ${v}\r\n`
  if (body) req += `Content-Length: ${new TextEncoder().encode(body).length}\r\n`
  req += '\r\n'
  if (body) req += body

  const result = await Promise.race([
    new Promise((resolve, reject) => {
      pendingResolve = resolve
      pendingReject = reject
      tls.prepare(req)
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT: 30s')), 30000)
    )
  ])

  socket.close()
  return result
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  try {
    const start = Date.now()
    const diag = {}

    const clientId = env.CLIENT_ID
    const clientSecret = env.CLIENT_SECRET
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({
        success: false, message: 'CLIENT_ID / CLIENT_SECRET env missing'
      }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
    }

    // 1. Test proxy connectivity first
    try {
      const testResult = await tunneledRequest('GET', '/', {
        'Host': NAVER_HOST,
        'Connection': 'close'
      }, null)
      diag.proxyTest = { statusCode: testResult.statusCode, body: testResult.body.substring(0, 300) }
    } catch (e) {
      return new Response(JSON.stringify({
        success: false,
        message: `Proxy test failed`,
        diag: { proxyError: e.message, time: Date.now() - start + 'ms' }
      }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
    }

    // 2. Get token
    const timestamp = String(Date.now())
    const password = clientId + '_' + timestamp
    const hashed = bcrypt.hashSync(password, clientSecret)
    const clientSecretSign = btoa(hashed)

    const body = new URLSearchParams({
      client_id: clientId, timestamp,
      client_secret_sign: clientSecretSign,
      grant_type: 'client_credentials', type: 'SELF'
    }).toString()

    const tokenRes = await tunneledRequest('POST', '/external/v1/oauth2/token', {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Connection': 'close'
    }, body)

    diag.tokenResponse = { statusCode: tokenRes.statusCode, body: tokenRes.body.substring(0, 500) }

    if (tokenRes.statusCode !== 200) {
      return new Response(JSON.stringify({
        success: false,
        message: `토큰 발급 실패: ${tokenRes.statusCode}`,
        diag
      }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
    }

    let token
    try {
      token = JSON.parse(tokenRes.body).access_token
    } catch (e) {
      return new Response(JSON.stringify({
        success: false,
        message: `토큰 응답 파싱 실패: ${e.message}`,
        diag
      }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
    }

    // 3. Search products
    const searchBody = JSON.stringify({ page: 1, size: 10 })
    const searchRes = await tunneledRequest('POST', '/external/v1/products/search', {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Connection': 'close'
    }, searchBody)

    diag.searchResponse = { statusCode: searchRes.statusCode, body: searchRes.body.substring(0, 500) }

    if (searchRes.statusCode !== 200) {
      return new Response(JSON.stringify({
        success: false,
        message: `상품 조회 실패: ${searchRes.statusCode}`,
        diag
      }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
    }

    let searchData
    try {
      searchData = JSON.parse(searchRes.body)
    } catch (e) {
      return new Response(JSON.stringify({
        success: false,
        message: `검색 응답 파싱 실패: ${e.message}`,
        diag
      }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
    }

    const products = searchData.contents || []
    const sample = products.length > 0
      ? { originProductNo: products[0].originProductNo, name: products[0].name || null }
      : null

    return new Response(JSON.stringify({
      success: true,
      elapsed: (Date.now() - start) + 'ms',
      data: { totalCount: products.length, sample },
      diag
    }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
  } catch (e) {
    return new Response(JSON.stringify({
      success: false, message: 'EXCEPTION: ' + e.message
    }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
  }
}
