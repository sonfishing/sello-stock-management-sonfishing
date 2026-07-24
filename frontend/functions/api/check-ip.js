export async function onRequest(context) {
  const res = await fetch('https://api.ipify.org?format=json')
  const data = await res.json()

  return new Response(JSON.stringify({
    outboundIp: data.ip,
    headers: Object.fromEntries([...context.request.headers])
  }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
}
