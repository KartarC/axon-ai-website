// api/submit-demo.js — Vercel serverless function
// Receives form POST, validates, saves to Supabase website_leads table
// No external email service — leads are viewable at /admin

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { name, email, company, volume } = req.body

    // Basic validation
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' })
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email is required' })

    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('Missing Supabase env vars')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    // Insert into Supabase
    const response = await fetch(`${SUPABASE_URL}/rest/v1/website_leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        company: company?.trim() || null,
        rfq_volume: volume?.trim() || null,
        source: 'axon-ai-website',
        status: 'new',
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Supabase insert failed:', err)
      return res.status(500).json({ error: 'Failed to save submission' })
    }

    const [lead] = await response.json()
    console.log('New lead saved:', lead?.id, email)

    return res.status(200).json({
      success: true,
      message: 'Demo request received',
      id: lead?.id,
    })

  } catch (err) {
    console.error('submit-demo error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
