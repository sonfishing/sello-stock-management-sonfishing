const RELAY_URL = 'http://sonfishing.iptime.org:5800'

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
    const data = await res.json()

    return new Response(JSON.stringify({
      success: res.ok,
      elapsed: (Date.now() - start) + 'ms',
      data
    }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      message: e.message
    }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  }
}
