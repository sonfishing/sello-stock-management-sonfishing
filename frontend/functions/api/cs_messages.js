const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  try {
    const kv = env.CS_MESSAGES

    if (request.method === 'GET') {
      const url = new URL(request.url)
      const statusFilter = url.searchParams.get('status')

      let list = await kv.get('list', { type: 'json' }) || []
      if (statusFilter) {
        list = list.filter(m => m.status === statusFilter)
      }

      return new Response(JSON.stringify({ success: true, data: list, total: list.length }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      })
    }

    if (request.method === 'PATCH') {
      const body = await request.json()
      const { id, status } = body

      if (!id || !status) {
        return new Response(JSON.stringify({ success: false, message: 'id and status required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        })
      }

      const list = await kv.get('list', { type: 'json' }) || []
      const idx = list.findIndex(m => m.id === id)
      if (idx === -1) {
        return new Response(JSON.stringify({ success: false, message: 'not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        })
      }

      list[idx].status = status
      await kv.put('list', JSON.stringify(list))

      return new Response(JSON.stringify({ success: true, data: list[idx] }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      })
    }

    if (request.method === 'DELETE') {
      const url = new URL(request.url)
      const id = url.searchParams.get('id')

      if (!id) {
        return new Response(JSON.stringify({ success: false, message: 'id required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        })
      }

      const list = await kv.get('list', { type: 'json' }) || []
      const filtered = list.filter(m => m.id !== id)
      await kv.put('list', JSON.stringify(filtered))

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      })
    }

    return new Response(JSON.stringify({ success: false, message: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  }
}
