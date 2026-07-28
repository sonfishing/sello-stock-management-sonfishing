const RELAY_URL = 'https://confidential-integral-leaves-kelkoo.trycloudflare.com'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

export async function onRequest(context) {
  const { request } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  try {
    const start = Date.now()
    const res = await fetch(RELAY_URL + '/test-naver')

    // Try to get body as text first
    const bodyText = await res.text()
    const elapsed = (Date.now() - start) + 'ms'

    // Try to parse as JSON
    let data
    try {
      data = JSON.parse(bodyText)
    } catch (parseErr) {
      return new Response(JSON.stringify({
        success: false,
        message: '릴레이 응답이 JSON이 아님',
        diag: {
          httpStatus: res.status,
          httpStatusText: res.statusText,
          body: bodyText.substring(0, 300),
          relayUrl: RELAY_URL + '/test-naver'
        }
      }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
    }

    return new Response(JSON.stringify({
      success: res.ok,
      elapsed,
      data
    }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      message: e.message,
      relayUrl: RELAY_URL + '/test-naver'
    }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
  }
}
