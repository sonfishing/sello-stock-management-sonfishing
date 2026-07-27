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

  const relayUrl = env.RELAY_SERVER_URL
  if (!relayUrl) {
    return new Response(JSON.stringify({ success: false, message: 'RELAY_SERVER_URL 환경변수가 설정되지 않음' }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  }

  try {
    const start = Date.now()
    let fetchOk = false
    let fetchData = null
    let fetchError = null

    try {
      const res = await fetch(relayUrl + '/test-naver')
      const elapsed = Date.now() - start
      if (res.ok) {
        fetchData = await res.json()
        fetchOk = true
      } else {
        const text = await res.text()
        fetchError = `HTTP ${res.status}: ${text.slice(0, 200)}`
      }
    } catch (e) {
      fetchError = e.message
    }

    return new Response(JSON.stringify({
      success: fetchOk,
      relayUrl,
      elapsed: (Date.now() - start) + 'ms',
      data: fetchData,
      error: fetchError
    }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      relayUrl,
      message: e.message
    }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  }
}
