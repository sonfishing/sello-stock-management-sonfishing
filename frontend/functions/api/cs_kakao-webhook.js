const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

export async function onRequest(context) {
  const { request, env } = context

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
    const body = await request.json()
    const { room, sender, msg, isGroupChat, timestamp } = body

    if (!sender || !msg) {
      return new Response(JSON.stringify({ success: false, message: 'sender and msg required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      })
    }

    const kv = env.CS_MESSAGES
    const existing = await kv.get('list', { type: 'json' }) || []
    const newMsg = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      room: room || '',
      sender,
      msg,
      isGroupChat: !!isGroupChat,
      timestamp: timestamp || Date.now(),
      status: 'pending',
      createdAt: new Date().toISOString()
    }

    existing.unshift(newMsg)
    await kv.put('list', JSON.stringify(existing))

    return new Response(JSON.stringify({ success: true, data: newMsg }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  }
}
