const {sb,authAdmin}=require('./supabase');
const {isUuid}=require('./security');
const {sendEmail}=require('./email');
function fail(message,status=400){const e=new Error(message);e.status=status;throw e}
function screenshot(value){
 if(value==null||value==='')return null;
 if(typeof value!=='string'||value.length>550000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))fail('Choose a PNG, JPEG or WebP screenshot under 400 KB.');
 const [header,data]=value.split(','),b=Buffer.from(data,'base64');
 const valid=header.includes('/png;')?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):header.includes('/jpeg;')?b[0]===255&&b[1]===216&&b[2]===255:b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
 if(!valid||b.length>409600)fail('Invalid screenshot. Choose a PNG, JPEG or WebP image under 400 KB.');return value;
}
async function support(req,res,ctx,staff=false){try{
 const id=req.query.id||req.body?.report_id;if(!isUuid(id))fail('Invalid report ID.');
 const [report]=await sb('GET','ovrendi_bug_reports?id=eq.'+id+(staff?'':`&account_id=eq.${ctx.account.id}&user_id=eq.${ctx.user.id}`));if(!report)fail('Report not found.',404);
 if(req.method==='GET'&&req.query.attachment){
  if(!isUuid(req.query.attachment))fail('Invalid attachment ID.');
  const [m]=await sb('GET',`ovrendi_support_messages?id=eq.${req.query.attachment}&report_id=eq.${id}&select=screenshot`);if(!m?.screenshot)fail('Screenshot not found.',404);
  return res.status(200).json({screenshot:m.screenshot});
 }
 if(req.method==='GET')return res.status(200).json(await sb('GET',`ovrendi_support_messages?report_id=eq.${id}&select=id,sender,body,has_screenshot,created_at,notified_at&order=created_at.asc&limit=100`));
 if(req.method!=='POST')fail('Method not allowed.',405);
 const b=req.body||{};
 if(staff&&b.action==='notify'){
   if(!isUuid(b.message_id))fail('Save a public reply first.');
   const [m]=await sb('GET',`ovrendi_support_messages?id=eq.${b.message_id}&report_id=eq.${id}&sender=eq.staff`);if(!m)fail('Reply not found.',404);
   if(m.notified_at)return res.status(200).json({message:'This reply was already submitted for email delivery.'});
   const user=await authAdmin('GET','users/'+report.user_id);if(!user?.email)fail('The reporter has no deliverable email.',409);
   // Keep confidential support content out of notification email and tracking URLs.
   const sent=await sendEmail({to:user.email,subject:'An update on your Ovrendi support report',text:'Ovrendi support has posted an update. Sign in to view your report and reply: https://getovrendi.com/app/support.html',html:'<p>Ovrendi support has posted an update.</p><p><a href="https://getovrendi.com/app/support.html">Sign in to view your report and reply</a></p>',kind:'support',idempotencyKey:'support-'+m.id});
   if(!sent.ok)fail('Email was not confirmed. The reply is saved; retry the notification later.',502);
   await sb('PATCH','ovrendi_support_messages?id=eq.'+m.id,{notified_at:new Date().toISOString()});return res.status(200).json({message:'Notification accepted by the email provider.'});
 }
 if(!isUuid(b.request_id)||typeof b.body!=='string'||!b.body.trim()||b.body.length>6000)fail('Enter a reply up to 6,000 characters.');
 const prior=await sb('GET','ovrendi_support_messages?id=eq.'+b.request_id);
 if(prior.length){if(prior[0].report_id!==id||prior[0].author_id!==(staff?ctx.id:ctx.user.id))fail('Request ID already used.',409);return res.status(200).json({id:prior[0].id});}
 if(!staff){const hourly=await sb('GET',`ovrendi_support_messages?author_id=eq.${ctx.user.id}&created_at=gt.${new Date(Date.now()-3600000).toISOString()}&select=id&limit=20`);if(hourly.length>=20)fail('You have sent several replies. Please try again later.',429);}
 const recent=await sb('GET',`ovrendi_support_messages?report_id=eq.${id}&select=id&limit=100`);if(recent.length>=100)fail('This conversation is full. Please create a new report.',409);
 const [m]=await sb('POST','ovrendi_support_messages',{id:b.request_id,report_id:id,sender:staff?'staff':'customer',author_id:staff?ctx.id:ctx.user.id,body:b.body.trim(),screenshot:screenshot(b.screenshot)});
 return res.status(201).json({id:m.id});
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Support request failed. Please retry.'});}}
module.exports={support,screenshot};
