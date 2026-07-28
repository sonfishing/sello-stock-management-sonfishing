const DEFAULT_RELAY_URL = 'https://relay.sonfishing.co.kr'

export async function onRequest(context) {
  const { env } = context
  const url = env.RELAY_URL || DEFAULT_RELAY_URL

  return new Response(JSON.stringify({
    success: true,
    relayUrl: url
  }), { headers: { 'Content-Type': 'application/json' } })
}
