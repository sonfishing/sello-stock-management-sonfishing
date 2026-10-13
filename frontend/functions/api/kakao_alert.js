const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

const KV_KEY = 'kakao_alert_list'
const MAX_ITEMS = 2000

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  })
}

// 시간순 (오래된 -> 최신) 정렬. time 포맷이 다르면 receivedAt 사용
function sortByTime(list) {
  return list.slice().sort((a, b) => {
    const ta = a.time || a.receivedAt || ''
    const tb = b.time || b.receivedAt || ''
    if (ta !== tb) return ta < tb ? -1 : 1
    return String(a.id || '').localeCompare(String(b.id || ''))
  })
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  try {
    const kv = env.CS_MESSAGES

    // 메신저봇R에서 키워드 감지 시 전송
    if (request.method === 'POST') {
      const body = await request.json()
      const room = String(body.room || '')
      const sender = String(body.sender || '')
      const msg = String(body.msg || '')
      const time = String(body.time || '')
      const keyword = String(body.keyword || '')

      if (!msg) {
        return json({ success: false, message: 'msg required' }, 400)
      }

      const list = (await kv.get(KV_KEY, { type: 'json' })) || []

      // 같은 메시지(방/보낸사람/내용/시간 동일)는 한 항목만 유지
      const duplicate = list.some(m =>
        m.room === room && m.sender === sender && m.msg === msg && m.time === time
      )
      if (duplicate) {
        return json({ success: true, duplicate: true })
      }

      const item = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        room,
        sender,
        msg,
        time,
        keyword,
        receivedAt: new Date().toISOString()
      }

      list.push(item)
      while (list.length > MAX_ITEMS) list.shift()
      await kv.put(KV_KEY, JSON.stringify(list))

      return json({ success: true, data: item })
    }

    // 웹 페이지에서 목록 조회
    if (request.method === 'GET') {
      const url = new URL(request.url)

      // 사이드바 배지용: since 이후 신규 건수만 경량 조회
      const since = (url.searchParams.get('since') || '').trim()
      if (since) {
        const all = (await kv.get(KV_KEY, { type: 'json' })) || []
        const count = all.filter(m => String(m.receivedAt || '') > since).length
        return json({ success: true, count })
      }

      const q = (url.searchParams.get('q') || '').trim().toLowerCase()
      const limit = parseInt(url.searchParams.get('limit') || '0', 10) || 0

      let list = sortByTime((await kv.get(KV_KEY, { type: 'json' })) || [])

      if (q) {
        list = list.filter(m =>
          (m.msg || '').toLowerCase().includes(q) ||
          (m.sender || '').toLowerCase().includes(q) ||
          (m.room || '').toLowerCase().includes(q) ||
          (m.keyword || '').toLowerCase().includes(q)
        )
      }

      if (limit > 0 && list.length > limit) {
        list = list.slice(-limit)
      }

      return json({ success: true, data: list, total: list.length })
    }

    // 삭제: ?id= 있으면 해당 항목만, 없으면 전체 삭제
    if (request.method === 'DELETE') {
      const url = new URL(request.url)
      const id = (url.searchParams.get('id') || '').trim()
      if (id) {
        const list = (await kv.get(KV_KEY, { type: 'json' })) || []
        const next = list.filter(m => m.id !== id)
        if (next.length === list.length) {
          return json({ success: false, message: 'not found' }, 404)
        }
        await kv.put(KV_KEY, JSON.stringify(next))
        return json({ success: true, deleted: id })
      }
      await kv.put(KV_KEY, JSON.stringify([]))
      return json({ success: true })
    }

    return json({ success: false, message: 'Method not allowed' }, 405)
  } catch (e) {
    return json({ success: false, message: e.message }, 500)
  }
}
