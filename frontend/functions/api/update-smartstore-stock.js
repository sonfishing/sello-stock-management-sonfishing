import bcrypt from 'bcryptjs'

const NAVER_TOKEN_URL = 'https://api.commerce.naver.com/external/v1/oauth2/token'

async function getAccessToken(clientId, clientSecret) {
  const timestamp = String(Date.now())
  const password = clientId + '_' + timestamp
  const hashed = bcrypt.hashSync(password, clientSecret)
  const clientSecretSign = btoa(hashed)

  const payload = new URLSearchParams({
    client_id: clientId,
    timestamp,
    client_secret_sign: clientSecretSign,
    grant_type: 'client_credentials',
    type: 'SELF'
  })

  const res = await fetch(NAVER_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`토큰 발급 실패: ${res.status} - ${text}`)
  }

  const json = await res.json()
  return json.access_token
}

async function updateNaverStock(token, product, newStockQuantity) {
  const category = product.category || ''
  const originProductNo = product.origin_product_no
  const optionId = product.option_id
  const productId = product.product_id

  let url, body

  if (category === '일반옵션') {
    if (!originProductNo || !optionId) throw new Error('일반옵션: origin_product_no, option_id 필요')
    url = `https://api.commerce.naver.com/external/v1/products/${originProductNo}/options/${optionId}/stock`
    body = { stockQuantity: newStockQuantity }
  } else if (category === '추가옵션') {
    if (!originProductNo || !productId) throw new Error('추가옵션: origin_product_no, product_id 필요')
    url = `https://api.commerce.naver.com/external/v1/products/${originProductNo}/supplement-products/${productId}/stock`
    body = { stockQuantity: newStockQuantity }
  } else if (category === '원상품') {
    if (!originProductNo) throw new Error('원상품: origin_product_no 필요')
    url = `https://api.commerce.naver.com/external/v1/products/${originProductNo}/stock`
    body = { stockQuantity: newStockQuantity }
  } else {
    throw new Error(`알 수 없는 category: "${category}"`)
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`스마트스토어 재고 업데이트 실패: ${res.status} - ${text}`)
  }

  return await res.json()
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, message: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }

  const clientId = env.CLIENT_ID
  const clientSecret = env.CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ success: false, message: 'CLIENT_ID / CLIENT_SECRET 환경변수가 설정되지 않았습니다.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }

  try {
    const { product, newStockQuantity } = await request.json()

    if (!product || newStockQuantity === undefined) {
      return new Response(JSON.stringify({ success: false, message: '필수 파라미터 누락' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const token = await getAccessToken(clientId, clientSecret)
    const result = await updateNaverStock(token, product, newStockQuantity)

    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
}
