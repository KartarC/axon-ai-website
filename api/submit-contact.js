const {sb}=require('./_lib/supabase');const {isUuid}=require('./_lib/security');const {conversion}=require('./_lib/engagement');
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 if(!['https://getovrendi.com','https://www.getovrendi.com','https://axon-ai-website-three.vercel.app'].includes(req.headers.origin))return res.status(403).json({error:'Please use the contact form on getovrendi.com.'});
 try{const b=req.body||{};
 if(b.website)return res.status(200).json({success:true});
 if(!isUuid(b.request_id)||b.privacy_ack!==true)return res.status(400).json({error:'Please acknowledge how we use your enquiry.'});
 const data={};for(const [k,max,required] of [['name',120,true],['email',254,true],['company',160,false],['message',6000,true]]){const v=b[k]??'';if(typeof v!=='string'||v.length>max||(required&&!v.trim()))return res.status(400).json({error:'Check the '+k+' field.'});data[k]=v.trim()}
 data.email=data.email.toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)||!['ERP','CRM','Studio','AI','Support','Privacy','Other'].includes(b.topic))return res.status(400).json({error:'Enter a valid email and enquiry type.'});
 if(!process.env.CRON_SECRET)return res.status(503).json({error:'Contact form temporarily unavailable. Email hello@getovrendi.com.'});
 const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown').split(',')[0];
 const bucket=require('crypto').createHmac('sha256',process.env.CRON_SECRET).update(ip+':'+Math.floor(Date.now()/3600000)).digest('hex');
 if(!await sb('POST','rpc/ovrendi_contact_allow',{p_bucket:bucket}))return res.status(429).json({error:'Too many attempts. Please try again later or email hello@getovrendi.com.'});
 const existing=await sb('GET','ovrendi_website_enquiries?id=eq.'+b.request_id+'&select=id');
 if(existing.length)return res.status(200).json({success:true});
 try{await sb('POST','ovrendi_website_enquiries',{id:b.request_id,...data,topic:b.topic,privacy_notice_version:'2026-10-09'})}catch(e){const duplicate=await sb('GET','ovrendi_website_enquiries?id=eq.'+b.request_id+'&select=id');if(!duplicate.length)throw e;return res.status(200).json({success:true})}
 await conversion(b.tracking,'contact');return res.status(200).json({success:true});
 }catch(_){return res.status(503).json({error:'Your enquiry could not be confirmed. Retry, or email hello@getovrendi.com.'})}
}
