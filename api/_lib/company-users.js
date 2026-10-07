const {sb,authAdmin}=require('./supabase')
const {isUuid,siteUrl}=require('./security')
const {emailStatus,sendEmail,invitationEmail,passwordResetEmail}=require('./email')
const roles=['owner','admin','manager','operator','viewer']
async function companyUsers(req,res){
 const {resource,id}=req.query, accountId=req.query.account_id||req.body?.account_id
 if(!isUuid(accountId))return res.status(400).json({error:'Select a company'})
 const [company]=await sb('GET',`accounts?id=eq.${accountId}&select=id,name`)||[]
 if(!company)return res.status(404).json({error:'Company not found'})
 if(resource==='company-team'&&req.method==='GET'){
  const members=await sb('GET',`account_users?account_id=eq.${accountId}&select=id,user_id,full_name,role,created_at&order=created_at.asc`)||[]
  const users=[]
  // Bounded concurrency, no global identity directory or credentials in the response.
  for(let i=0;i<members.length;i+=5)users.push(...await Promise.all(members.slice(i,i+5).map(async m=>{const u=await authAdmin('GET',`users/${m.user_id}`);return{...m,email:u.email,last_sign_in_at:u.last_sign_in_at||null}})))
  const invites=await sb('GET',`account_invites?account_id=eq.${accountId}&accepted_at=is.null&select=id,email,role,expires_at,created_at&order=created_at.desc`)||[]
  return res.status(200).json({company,users,invites,email_ready:emailStatus().invitations_ready})
 }
 if(!isUuid(id))return res.status(400).json({error:'Select a user or invitation'})
 if(resource==='company-user'||resource==='user-reset'){
  const [member]=await sb('GET',`account_users?id=eq.${id}&account_id=eq.${accountId}&select=id,user_id,role,full_name`)||[]
  if(!member)return res.status(404).json({error:'User not found in this company'})
  if(resource==='company-user'&&req.method==='PATCH'){
   const updates={}
   if(req.body.full_name!==undefined){if(typeof req.body.full_name!=='string'||!req.body.full_name.trim()||req.body.full_name.length>120)return res.status(400).json({error:'Full name is required (maximum 120 characters)'});updates.full_name=req.body.full_name.trim()}
   if(req.body.role!==undefined){if(!roles.includes(req.body.role))return res.status(400).json({error:'Choose a valid role'});if(member.role==='owner'&&req.body.role!=='owner')return res.status(409).json({error:'Owner access is protected. Contact support for an ownership transfer.'});updates.role=req.body.role}
   if(!Object.keys(updates).length)return res.status(400).json({error:'No changes provided'})
   const [updated]=await sb('PATCH',`account_users?id=eq.${id}&account_id=eq.${accountId}`,updates)
   return res.status(200).json(updated)
  }
  if(resource==='company-user'&&req.method==='DELETE'){
   if(member.role==='owner')return res.status(409).json({error:'The company owner cannot be removed here'})
   await sb('DELETE',`account_users?id=eq.${id}&account_id=eq.${accountId}`)
   return res.status(200).json({ok:true})
  }
  if(resource==='user-reset'&&req.method==='POST'){
   if(!emailStatus().invitations_ready)return res.status(409).json({error:'Verify auth.getovrendi.com with tracking off and configure the secure sender before sending password resets.'})
   const user=await authAdmin('GET',`users/${member.user_id}`)
   // Generate a recovery link, never set, expose or return a user's password.
   const link=await authAdmin('POST','generate_link',{type:'recovery',email:user.email,redirect_to:siteUrl()+'/app/reset-password.html'})
   const action=link.action_link||link.properties?.action_link
   if(!action||new URL(action).searchParams.get('redirect_to')!==siteUrl()+'/app/reset-password.html')return res.status(502).json({error:'Could not generate a reset email'})
   const delivered=await sendEmail({to:user.email,...passwordResetEmail(action)})
   return res.status(delivered.ok?200:502).json(delivered.ok?{ok:true,message:'Password-reset email accepted by Resend. Delivery can be checked in Resend.'}:{error:'Reset email was not accepted by the provider. Try again after checking email configuration.'})
  }
 }
 if(resource==='company-invite'){
  const [invite]=await sb('GET',`account_invites?id=eq.${id}&account_id=eq.${accountId}&accepted_at=is.null&select=id,email,token,expires_at`)||[]
  if(!invite)return res.status(404).json({error:'Pending invitation not found'})
  if(req.method==='DELETE'){await sb('DELETE',`account_invites?id=eq.${id}&account_id=eq.${accountId}&accepted_at=is.null`);return res.status(200).json({ok:true})}
  if(req.method==='POST'){
   if(new Date(invite.expires_at)<=new Date())return res.status(410).json({error:'Invitation expired. Revoke it and create a new invitation.'})
   const invite_url=siteUrl()+'/app/accept-invite.html?token='+invite.token
   if(req.body.send_email===true){
    if(!emailStatus().invitations_ready)return res.status(409).json({error:'Secure invitation email is not configured yet. You can copy the private link.'})
    const sent=await sendEmail({to:invite.email,...invitationEmail(company.name,invite_url),idempotencyKey:`invite-${invite.id}`})
    if(!sent.ok)return res.status(502).json({error:'Resend did not accept the invitation. The existing link is still valid.'})
    return res.status(200).json({ok:true,message:'Invitation accepted by Resend (duplicate sends within 24 hours are suppressed).'})
   }
   return res.status(200).json({invite_url})
  }
 }
 return res.status(405).json({error:'Method not allowed'})
}
module.exports={companyUsers}
