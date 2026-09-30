const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

const DEFAULT_RELAY_URL = 'http://tfc.ipdisk.co.kr/sonfishing_naver_api.php'

export async function onRequest(context) {
  const { request, env } = context
  const relayUrl = request.headers.get('X-Relay-Url') || env.RELAY_URL || DEFAULT_RELAY_URL

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  try {
    const start = Date.now()
    const res = await fetch(relayUrl + '?action=test-naver')
    const bodyText = await res.text()
    const elapsed = (Date.now() - start) + 'ms'

    let data
    try {
      data = JSON.parse(bodyText)
    } catch (parseErr) {
      return new Response(JSON.stringify({
        success: false,
        message: '릴레???�답??JSON???�님',
        diag: {
          httpStatus: res.status,
          httpStatusText: res.statusText,
          body: bodyText.substring(0, 300),
          relayUrl: relayUrl + '?action=test-naver'
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
      relayUrl: relayUrl + '?action=test-naver'
    }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
  }
}
