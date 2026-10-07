const { createHash } = require('crypto')
const { sb, authAdmin } = require('./supabase')
const { isToken } = require('./security')
async function setupStaff(req,res) {
 res.setHeader('Cache-Control','no-store')
 const {token,email,password}=req.body||{}
 if(!isToken(token,64)||typeof email!=='string'||email.length>254||typeof password!=='string'||password.length<12||password.length>256) return res.status(400).json({error:'Use your private setup link, approved email, and a password of 12–256 characters.'})
 const hash=createHash('sha256').update(token).digest('hex')
 let created
 try {
  const [staff]=await sb('GET',`ovrendi_internal_staff?setup_token_hash=eq.${hash}&active=eq.true&user_id=is.null&select=id,email,setup_expires_at`)||[]
  if(!staff||staff.email!==email.trim().toLowerCase()||!staff.setup_expires_at||new Date(staff.setup_expires_at)<=new Date()) return res.status(410).json({error:'This setup link is invalid, expired, already used, or belongs to another email.'})
  // A random, single-use invitation proves possession. Never reset an existing identity.
  const user=await authAdmin('POST','users',{email:staff.email,password,email_confirm:true})
  created=user.id
  const rows=await sb('PATCH',`ovrendi_internal_staff?id=eq.${staff.id}&setup_token_hash=eq.${hash}&user_id=is.null&active=eq.true`,{user_id:user.id,setup_token_hash:null,setup_expires_at:null})
  if(!rows?.length)throw Error('Setup no longer available')
  created=null
  return res.status(200).json({ok:true})
 }catch(_){
  if(created)try{await authAdmin('DELETE',`users/${created}`)}catch(_){console.error('Staff setup cleanup requires administrator review')}
  return res.status(409).json({error:'Could not activate this account. If you already have an account, contact your administrator to enable staff access.'})
 }
}
module.exports={setupStaff}
