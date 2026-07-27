export async function onRequest(context) {
  const { env } = context
  const relayUrl = env.RELAY_SERVER_URL

  if (!relayUrl) {
    return new Response(JSON.stringify({ success: false, message: 'RELAY_SERVER_URL 환경변수가 설정되지 않음' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }

  try {
    const start = Date.now()
    const res = await fetch(relayUrl + '/test-naver', { timeout: 20000 })
    const elapsed = Date.now() - start
    const data = await res.json()

    return new Response(JSON.stringify({
      success: data.success,
      relayUrl,
      status: res.status,
      elapsed: elapsed + 'ms',
      data
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      relayUrl,
      message: e.message
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
}
