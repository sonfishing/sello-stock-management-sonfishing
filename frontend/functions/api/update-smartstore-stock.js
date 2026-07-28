const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

const DEFAULT_RELAY_URL = 'https://confidential-integral-leaves-kelkoo.trycloudflare.com'

export async function onRequest(context) {
  const { request, env } = context
  const relayUrl = env.RELAY_URL || DEFAULT_RELAY_URL

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

    const relayRes = await fetch(relayUrl + '/update-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product, newStockQuantity })
    })
    const result = await relayRes.json()

    return new Response(JSON.stringify(result), {
      status: relayRes.ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  }
}
