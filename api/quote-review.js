
const {sb}=require('./_lib/supabase')
const {isUuid}=require('./_lib/security')
const {hash,customerQuote}=require('./_lib/quote-links')
export const config={api:{bodyParser:{sizeLimit:'8kb'}}}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow')
 if(req.method!=='POST')return res.status(405).json({error:'Use POST.'})
 const b=req.body||{}
 if(typeof b.token!=='string'||!/^[a-f0-9]{64}$/.test(b.token)||!['read','respond'].includes(b.action))return res.status(400).json({error:'Invalid quotation link or action.'})
 const response={}
 if(b.action==='respond'){
  if(!['accepted','declined','changes_requested'].includes(b.decision)||b.confirmed!==true||!isUuid(b.request_id))return res.status(400).json({error:'Choose a response and confirm your authority.'})
  for(const [key,max] of [['name',160],['email',254],['purchase_order',160],['message',2000]]){
   const v=b[key]??'';if(typeof v!=='string'||v.length>max)return res.status(400).json({error:'Check the response fields.'});response[key]=v.trim()
  }
  if(!response.name||!/^\S+@[^\s@]+\.[^\s@]+$/.test(response.email)||(b.decision==='changes_requested'&&!response.message))return res.status(400).json({error:'Enter your name, email and any requested changes.'})
  Object.assign(response,{decision:b.decision,confirmed:true,request_id:b.request_id})
 }
 try{
  const data=await sb('POST','rpc/ovrendi_public_quote',{p_hash:hash(b.token),p_action:b.action,p_response:response})
  if(data.error)return res.status(409).json({error:data.error})
  return res.status(200).json(customerQuote(data))
 }catch(_){return res.status(503).json({error:'Quotation service is temporarily unavailable. Please retry.'})}
}
