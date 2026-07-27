import net from 'node:net'
import tls from 'node:tls'
import bcrypt from 'bcryptjs'

const PROXY_HOST = 'sonfishing.iptime.org'
const PROXY_PORT = 5800
const NAVER_HOST = 'api.commerce.naver.com'
const NAVER_PORT = 443

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

function createTlsSocket() {
  return new Promise((resolve, reject) => {
    const tcp = net.connect(PROXY_PORT, PROXY_HOST, () => {
      tcp.write(`CONNECT ${NAVER_HOST}:${NAVER_PORT} HTTP/1.1\r\nHost: ${NAVER_HOST}:${NAVER_PORT}\r\n\r\n`)
    })
    tcp.once('data', (chunk) => {
      if (chunk.toString().includes('200 Connection established')) {
        const tlsSocket = new tls.TLSSocket(tcp, {
          host: NAVER_HOST,
          servername: NAVER_HOST,
          rejectUnauthorized: false
        })
        resolve(tlsSocket)
      } else {
        reject(new Error('Proxy CONNECT failed: ' + chunk.toString()))
      }
    })
    tcp.on('error', reject)
  })
}

function rawRequest(method, path, headers, body) {
  return new Promise((resolve, reject) => {
    createTlsSocket().then(socket => {
      let req = `${method} ${path} HTTP/1.1\r\nHost: ${NAVER_HOST}\r\n`
      for (const [k, v] of Object.entries(headers)) req += `${k}: ${v}\r\n`
      if (body) req += `Content-Length: ${new TextEncoder().encode(body).length}\r\n`
      req += '\r\n'
      if (body) req += body

      let raw = ''
      socket.on('data', (chunk) => {
        raw += chunk.toString()
        const headerEnd = raw.indexOf('\r\n\r\n')
        if (headerEnd !== -1) {
          const hs = raw.substring(0, headerEnd)
          const bodyStart = headerEnd + 4
          const clMatch = hs.match(/Content-Length:\s*(\d+)/i)
          if (clMatch) {
            const cl = parseInt(clMatch[1])
            if (raw.substring(bodyStart).length >= cl) {
              socket.end()
              const statusLine = raw.substring(0, raw.indexOf('\r\n'))
              const sc = parseInt(statusLine.split(' ')[1])
              resolve({ statusCode: sc, body: raw.substring(bodyStart).trim() })
            }
          } else {
            socket.end()
            const statusLine = raw.substring(0, raw.indexOf('\r\n'))
            const sc = parseInt(statusLine.split(' ')[1])
            resolve({ statusCode: sc, body: raw.substring(bodyStart).trim() })
          }
        }
      })
      socket.on('error', reject)
      socket.write(req)
    }).catch(reject)
  })
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
  const res = await rawRequest('PUT', urlPath, {
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
