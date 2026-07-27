import { connect } from 'cloudflare:sockets'
import bcrypt from 'bcryptjs'
import forge from 'node-forge'

const PROXY_HOST = 'sonfishing.iptime.org'
const PROXY_PORT = 5800
const NAVER_HOST = 'api.commerce.naver.com'
const NAVER_PORT = 443

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  let resp = ''
  while (true) {
    const { value, done } = await sr.read()
    if (done) break
    resp += new TextDecoder().decode(value)
    if (resp.includes('\r\n\r\n')) break
  }
  sr.releaseLock()

  if (!resp.includes('200 Connection established')) {
    socket.close()
    throw new Error('CONNECT failed: ' + resp)
  }

  let plaintext = ''
  let tlsReady = false
  let pendingResolve = null
  let pendingReject = null

  const tls = forge.tls.createConnection({
    server: [],
    verify: () => true,
    connected: () => { tlsReady = true },
    getData: (c, data) => {
      plaintext += data.getBytes()
      const hp = plaintext.indexOf('\r\n\r\n')
      if (hp !== -1 && pendingResolve) {
        const hs = plaintext.substring(0, hp)
        const bs = hp + 4
        const cm = hs.match(/Content-Length:\s*(\d+)/i)
        if (cm) {
          if (plaintext.substring(bs).length >= parseInt(cm[1])) {
            const sc = parseInt(hs.split(' ')[1])
            pendingResolve({ statusCode: sc, body: plaintext.substring(bs).trim() })
            pendingResolve = null
          }
        } else {
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
        pendingReject(new Error(error.message))
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
      tls.process(value)
    }
    r.releaseLock()
  })()

  let req = `${method} ${path} HTTP/1.1\r\nHost: ${NAVER_HOST}\r\n`
  for (const [k, v] of Object.entries(headers)) req += `${k}: ${v}\r\n`
  if (body) req += `Content-Length: ${new TextEncoder().encode(body).length}\r\n`
  req += '\r\n'
  if (body) req += body

  const result = await new Promise((resolve, reject) => {
    pendingResolve = resolve
    pendingReject = reject
    tls.prepare(req)
  })

  socket.close()
  return result
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

  const res = await tunneledRequest('POST', '/external/v1/oauth2/token', {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Connection': 'close'
  }, body)

  if (res.statusCode !== 200) throw new Error(`토큰 발급 실패: ${res.statusCode} - ${res.body}`)
  return JSON.parse(res.body).access_token
}

async function updateNaverStock(token, product, newStockQuantity) {
  const category = product.category || ''
  const originProductNo = product.origin_product_no
  const optionId = product.option_id

  let urlPath
  if (category === '일반옵션') {
    if (!originProductNo || !optionId) throw new Error('일반옵션: origin_product_no, option_id 필요')
    urlPath = `/external/v1/products/${originProductNo}/options/${optionId}/stock`
  } else if (category === '추가옵션') {
    if (!originProductNo || !optionId) throw new Error('추가옵션: origin_product_no, option_id 필요')
    urlPath = `/external/v1/products/${originProductNo}/supplement-products/${optionId}/stock`
  } else if (category === '원상품') {
    if (!originProductNo) throw new Error('원상품: origin_product_no 필요')
    urlPath = `/external/v1/products/${originProductNo}/stock`
  } else {
    throw new Error(`알 수 없는 category: "${category}"`)
  }

  const body = JSON.stringify({ stockQuantity: newStockQuantity })
  const res = await tunneledRequest('PUT', urlPath, {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Connection': 'close'
  }, body)

  if (res.statusCode !== 200) throw new Error(`스마트스토어 재고 업데이트 실패: ${res.statusCode} - ${res.body}`)
  return JSON.parse(res.body)
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, message: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  }

  try {
    const { product, newStockQuantity } = await request.json()

    if (!product || newStockQuantity === undefined) {
      return new Response(JSON.stringify({ success: false, message: '필수 파라미터 누락' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      })
    }

    const clientId = env.CLIENT_ID
    const clientSecret = env.CLIENT_SECRET
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ success: false, message: 'CLIENT_ID / CLIENT_SECRET 환경변수가 설정되지 않았습니다.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      })
    }

    const token = await getAccessToken(clientId, clientSecret)
    const result = await updateNaverStock(token, product, newStockQuantity)

    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  }
}
