const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

const KV_KEY = 'kakao_config'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  })
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  try {
    const kv = env.CS_MESSAGES

    // 메신저봇R / 웹에서 현재 설정 조회
    if (request.method === 'GET') {
      const cfg = (await kv.get(KV_KEY, { type: 'json' })) || {}
      return json({
        success: true,
        data: {
          room: typeof cfg.room === 'string' ? cfg.room : '',
          keywords: Array.isArray(cfg.keywords) ? cfg.keywords : [],
          updatedAt: cfg.updatedAt || ''
        }
      })
    }

    // 웹 설정창에서 저장
    if (request.method === 'POST') {
      const body = await request.json()
      const room = String(body.room || '').trim()
      const keywords = (Array.isArray(body.keywords) ? body.keywords : [])
        .map(k => String(k).trim())
        .filter(k => k.length > 0)

      const cfg = { room, keywords, updatedAt: new Date().toISOString() }
      await kv.put(KV_KEY, JSON.stringify(cfg))

      return json({ success: true, data: { room, keywords } })
    }

    // 설정 삭제 (봇은 스크립트 기본값으로 복귀)
    if (request.method === 'DELETE') {
      await kv.put(KV_KEY, JSON.stringify({ room: '', keywords: [], updatedAt: '' }))
      return json({ success: true })
    }

    return json({ success: false, message: 'Method not allowed' }, 405)
  } catch (e) {
    return json({ success: false, message: e.message }, 500)
  }
}
