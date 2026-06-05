// GET /api/auth/session
// Validates JWT and returns { user, account, role, modules }
const { requireAuth, cors } = require('../_lib/supabase')

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const ctx = await requireAuth(req, res)
  if (!ctx) return // requireAuth already sent error response

  res.status(200).json({
    user: {
      id:    ctx.user.id,
      email: ctx.user.email,
    },
    role:      ctx.role,
    full_name: ctx.full_name,
    account:   ctx.account,
  })
}
