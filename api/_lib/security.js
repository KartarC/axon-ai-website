const crypto = require('crypto')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = value => typeof value === 'string' && UUID.test(value)
const isToken = (value, length) => typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`, 'i').test(value)

// Reject filter syntax in identifiers before interpolating them into PostgREST URLs.
function validateIds(req, res) {
  for (const source of [req.query, req.body]) {
    if (!source || typeof source !== 'object') continue
    for (const [key, value] of Object.entries(source)) {
      if ((key === 'id' || key.endsWith('_id')) && value != null && value !== '' && !isUuid(value)) {
        res.status(400).json({ error: `Invalid ${key}` })
        return false
      }
    }
  }
  return true
}

function secretMatches(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || !expected) return false
  const a = Buffer.from(actual), b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function siteUrl() {
  // Never build emailed links or payment redirects from caller-controlled Host headers.
  return (process.env.SITE_URL || 'https://axon-ai-website-three.vercel.app').replace(/\/$/, '')
}

function completionError(step, updates, signedIn) {
  if (updates.status !== 'complete') return null
  if (step.requires_dimension && !String(updates.dimension_value ?? step.dimension_value ?? '').trim())
    return 'A dimension measurement is required to complete this step'
  if (step.requires_sign_off && !(signedIn && updates.sign_off === true))
    return 'This step requires a signed-in operator to sign off'
  return null
}

module.exports = { isUuid, isToken, validateIds, secretMatches, siteUrl, completionError }
