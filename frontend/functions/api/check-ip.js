export async function onRequest(context) {
  const [v4, v6] = await Promise.allSettled([
    fetch('https://api.ipify.org?format=json').then(r => r.json()),
    fetch('https://api6.ipify.org?format=json').then(r => r.json())
  ])

  return new Response(JSON.stringify({
    ipv4: v4.status === 'fulfilled' ? v4.value.ip : null,
    ipv6: v6.status === 'fulfilled' ? v6.value.ip : null
  }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
}
