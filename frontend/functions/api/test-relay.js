import { connect } from 'cloudflare:sockets'
import bcrypt from 'bcryptjs'

const PROXY_HOST = 'sonfishing.iptime.org'
const PROXY_PORT = 5800
const NAVER_HOST = 'api.commerce.naver.com'
const NAVER_PORT = 443

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

async function createTlsSocket() {
  const socket = connect({ hostname: PROXY_HOST, port: PROXY_PORT })

  const writer = socket.writable.getWriter()
  await writer.write(new TextEncoder().encode(
    `CONNECT ${NAVER_HOST}:${NAVER_PORT} HTTP/1.1\r\nHost: ${NAVER_HOST}:${NAVER_PORT}\r\n\r\n`
  ))
  writer.releaseLock()

  const reader = socket.readable.getReader()
  let resp = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    resp += new TextDecoder().decode(value)
    if (resp.includes('\r\n\r\n')) break
  }
  reader.releaseLock()

  if (!resp.includes('200 Connection established')) {
    throw new Error('Proxy CONNECT failed: ' + resp)
  }

  return socket.startTls({ serverName: NAVER_HOST })
}

async function rawRequest(method, path, headers, body) {
  const socket = await createTlsSocket()
  try {
    const writer = socket.writable.getWriter()
    let req = `${method} ${path} HTTP/1.1\r\nHost: ${NAVER_HOST}\r\n`
    for (const [k, v] of Object.entries(headers)) req += `${k}: ${v}\r\n`
    if (body) req += `Content-Length: ${new TextEncoder().encode(body).length}\r\n`
    req += '\r\n'
    if (body) req += body

    await writer.write(new TextEncoder().encode(req))
    writer.releaseLock()

    const reader = socket.readable.getReader()
    let raw = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      raw += new TextDecoder().decode(value, { stream: true })

      const headerEnd = raw.indexOf('\r\n\r\n')
      if (headerEnd !== -1) {
        const hs = raw.substring(0, headerEnd)
        const bodyStart = headerEnd + 4
        const clMatch = hs.match(/Content-Length:\s*(\d+)/i)
        if (clMatch) {
          const cl = parseInt(clMatch[1])
          if (raw.substring(bodyStart).length >= cl) break
        } else if (/Transfer-Encoding:\s*chunked/i.test(hs)) {
          if (raw.endsWith('0\r\n\r\n')) break
        } else {
          break
        }
      }
    }
    reader.releaseLock()

    const headerEnd = raw.indexOf('\r\n\r\n')
    const statusLine = raw.substring(0, raw.indexOf('\r\n'))
    const sc = parseInt(statusLine.split(' ')[1])
    return { statusCode: sc, body: raw.substring(headerEnd + 4).trim() }
  } finally {
    await socket.close()
  }
}

async function getAccessToken(clientId, clientSecret) {
  const timestamp = String(Date.now())
  const password = clientId + '_' + timestamp
  const hashed = bcrypt.hashSync(password, clientSecret)
  const clientSecretSign = btoa(hashed)

  const body = new URLSearchParams({
    client_id: clientId, timestamp,
    client_secret_sign: clientSecretSign,
    grant_type: 'client_credentials', type: 'SELF'
  }).toString()

  const res = await rawRequest('POST', '/external/v1/oauth2/token', {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Connection': 'close'
  }, body)

  if (res.statusCode !== 200) throw new Error(`토큰 발급 실패: ${res.statusCode} - ${res.body}`)
  return JSON.parse(res.body).access_token
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  try {
    const start = Date.now()

    const clientId = env.CLIENT_ID
    const clientSecret = env.CLIENT_SECRET
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ success: false, message: 'CLIENT_ID / CLIENT_SECRET 환경변수가 설정되지 않음' }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      })
    }

    const token = await getAccessToken(clientId, clientSecret)

    const searchBody = JSON.stringify({ page: 1, size: 10 })
    const searchRes = await rawRequest('POST', '/external/v1/products/search', {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Connection': 'close'
    }, searchBody)

    if (searchRes.statusCode !== 200) throw new Error(`상품 조회 실패: ${searchRes.statusCode} - ${searchRes.body}`)

    const data = JSON.parse(searchRes.body)
    const products = data.contents || []
    const sample = products.length > 0
      ? { originProductNo: products[0].originProductNo, name: products[0].name || null }
      : null

    return new Response(JSON.stringify({
      success: true,
      elapsed: (Date.now() - start) + 'ms',
      data: { totalCount: products.length, sample }
    }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: e.message }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  }
}
