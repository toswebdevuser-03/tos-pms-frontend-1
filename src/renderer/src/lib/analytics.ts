// Lightweight product analytics via Amplitude's HTTP V2 API — no SDK dependency.
// Entirely a no-op until an API key is configured (Settings → Product analytics),
// so track() is safe to call from anywhere. Events are fire-and-forget; analytics
// must never break or slow the app.

let apiKey = ''
let userId = ''
let userProps: Record<string, string> = {}

function deviceId(): string {
  let d = localStorage.getItem('tos_device_id')
  if (!d) { d = crypto.randomUUID(); localStorage.setItem('tos_device_id', d) }
  return d
}

export function initAnalytics(key: string | undefined, member?: { id: number; role?: string; discipline?: string } | null): void {
  apiKey = (key ?? '').trim()
  userId = member ? `member-${member.id}` : '' // no emails/names sent — id + role only
  userProps = member ? { role: member.role ?? '', discipline: member.discipline ?? '' } : {}
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (!apiKey) return
  const body = {
    api_key: apiKey,
    events: [{
      user_id: userId || undefined,
      device_id: deviceId(),
      event_type: event,
      time: Date.now(),
      event_properties: props ?? {},
      user_properties: userProps,
      platform: 'Web'
    }]
  }
  void fetch('https://api2.amplitude.com/2/httpapi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(() => { /* swallow — never surface analytics failures */ })
}
