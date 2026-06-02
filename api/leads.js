// api/leads.js — GET all leads, PATCH to update status
// Protected by ADMIN_SECRET env var via ?secret=xxx

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { secret } = req.query
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (req.method === 'GET') {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/website_leads?select=*&order=created_at.desc`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      })
      if (!r.ok) throw new Error(await r.text())
      return res.status(200).json(await r.json())
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  if (req.method === 'PATCH') {
    const { id, status } = req.query
    const validStatuses = ['new', 'contacted', 'booked', 'closed']
    if (!id || !status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid id or status' })
    }
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/website_leads?id=eq.${id}`,
        {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ status }),
        }
      )
      if (!r.ok) throw new Error(await r.text())
      return res.status(200).json({ success: true })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
