const {sb}=require('./supabase');const {isUuid}=require('./security');
async function enquiries(req,res){try{
 if(req.method==='GET')return res.status(200).json(await sb('GET','ovrendi_website_enquiries?order=created_at.desc&limit=500'));
 if(req.method!=='PATCH')return res.status(405).json({error:'Method not allowed'});
 if(!isUuid(req.query.id)||!['new','in_progress','resolved','closed'].includes(req.body?.status)||typeof req.body?.staff_notes!=='string'||req.body.staff_notes.length>4000)return res.status(400).json({error:'Invalid enquiry update'});
 const rows=await sb('PATCH','ovrendi_website_enquiries?id=eq.'+req.query.id,{status:req.body.status,staff_notes:req.body.staff_notes,updated_at:new Date().toISOString()});return res.status(rows.length?200:404).json(rows[0]||{error:'Enquiry not found'});
 }catch(_){return res.status(503).json({error:'Could not load or update enquiries'})}}
module.exports={enquiries};
