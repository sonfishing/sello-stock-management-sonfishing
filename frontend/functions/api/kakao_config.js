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

// 저장된 설정을 규칙 배열로 정규화 (이전 단일 설정 형식도 변환)
function normalizeRules(cfg) {
  const toRule = (room, keywords) => ({
    room: String(room || '').trim(),
    keywords: (Array.isArray(keywords) ? keywords : [])
      .map(k => String(k).trim())
      .filter(k => k.length > 0)
  })

  if (Array.isArray(cfg.rules)) {
    return cfg.rules
      .map(r => toRule(r.room, r.keywords))
      .filter(r => r.room || r.keywords.length)
  }

  // 이전 형식 {room, keywords} → 규칙 1개로 변환
  if (typeof cfg.room === 'string' || Array.isArray(cfg.keywords)) {
    const rule = toRule(cfg.room, cfg.keywords)
    return rule.room || rule.keywords.length ? [rule] : []
  }

  return []
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
          rules: normalizeRules(cfg),
          updatedAt: cfg.updatedAt || ''
        }
      })
    }

    // 웹 설정창에서 저장 (방+키워드 쌍 여러 개)
    if (request.method === 'POST') {
      const body = await request.json()
      const rules = (Array.isArray(body.rules) ? body.rules : [])
        .map(r => ({
          room: String(r.room || '').trim(),
          keywords: (Array.isArray(r.keywords) ? r.keywords : [])
            .map(k => String(k).trim())
            .filter(k => k.length > 0)
        }))
        .filter(r => r.room || r.keywords.length)

      await kv.put(KV_KEY, JSON.stringify({ rules, updatedAt: new Date().toISOString() }))

      return json({ success: true, data: { rules } })
    }

    // 설정 삭제 (봇은 스크립트 기본값으로 복귀)
    if (request.method === 'DELETE') {
      await kv.put(KV_KEY, JSON.stringify({ rules: [], updatedAt: '' }))
      return json({ success: true })
    }

    return json({ success: false, message: 'Method not allowed' }, 405)
  } catch (e) {
    return json({ success: false, message: e.message }, 500)
  }
}
