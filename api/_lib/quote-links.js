
const {randomBytes,createHash}=require('crypto')
const hash=token=>createHash('sha256').update(token).digest('hex')
function customerQuote(data){
 const q=data.quote,s=q.source||{},r=q.result||{},company=r.identity?.company||{},user=r.identity?.user||{}
 return {number:'LQ-'+q.family_id.slice(0,8).toUpperCase(),revision:q.revision,customer:q.customer,reference:q.reference,terms:q.terms,status:q.status,issued_at:q.issued_at,expires_at:data.expires_at,valid_until:new Date(Date.parse(q.issued_at)+q.valid_days*86400000).toISOString(),
 price:r.price,currency:r.currency,material:s.material,thickness:s.thicknessMm,
 company:{name:company.name||'Quotation',address:company.address||'',email:company.email||''},prepared_by:user.name||'',
 parts:(s.parts||[]).map(p=>({name:p.name,width:p.widthMm,height:p.heightMm,quantity:p.nested})),
 response:data.response,responded_at:data.responded_at,can_respond:q.status==='issued'&&!data.response}
}
async function manage(sb,ctx,id,action){
 const token=action==='create'?randomBytes(32).toString('hex'):null
 const result=await sb('POST','rpc/ovrendi_manage_quote_link',{p_account:ctx.account.id,p_user:ctx.user.id,p_quote:id,p_action:action,p_hash:token?hash(token):null})
 if(result.error){const e=Error(result.error);e.status=409;throw e}
 return token?{...result,url:'https://getovrendi.com/quote/#'+token}:result
}
module.exports={hash,customerQuote,manage}
