// Staff-only shared mailbox. All provider credentials stay on the server.
const MAILBOX = 'hello@getovrendi.com';
const required = ['ZOHO_CLIENT_ID','ZOHO_CLIENT_SECRET','ZOHO_REFRESH_TOKEN','ZOHO_MAIL_ACCOUNT_ID'];
const configured = () => required.every(key => !!process.env[key]);
const numeric = value => typeof value === 'string' && /^\d{1,30}$/.test(value);
let cachedToken, expires=0, refreshing;
async function token() {
 if(cachedToken && Date.now()<expires)return cachedToken;
 if(!refreshing)refreshing=(async()=>{
  const response=await fetch('https://accounts.zohocloud.ca/oauth/v2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:process.env.ZOHO_CLIENT_ID,client_secret:process.env.ZOHO_CLIENT_SECRET,refresh_token:process.env.ZOHO_REFRESH_TOKEN}),signal:AbortSignal.timeout(15000)});
  const result=await response.json();
  if(!response.ok||!result.access_token)throw Error('Zoho authorization failed. Reconnect the mailbox.');
  cachedToken=result.access_token;expires=Date.now()+Math.max(0,Math.min(Number(result.expires_in)||3600,3600)-60)*1000;return cachedToken;
 })().finally(()=>{refreshing=null});
 return refreshing;
}
async function call(path,body) {
 const response=await fetch('https://mail.zohocloud.ca/api/accounts/'+process.env.ZOHO_MAIL_ACCOUNT_ID+path,{method:body?'POST':'GET',headers:{Authorization:'Zoho-oauthtoken '+await token(),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const result=await response.json();
 if(!response.ok||Number(result.status?.code)>=400){if(response.status===401){cachedToken=null;expires=0}throw Error('Zoho could not complete this request. Check mailbox permissions and connection.');}
 return result.data;
}
function recipients(value,optional=false){
 if(optional&&!value)return '';
 if(typeof value!=='string'||value.length>2000)throw Error('Enter valid recipient email addresses.');
 const list=value.split(',').map(v=>v.trim());
 if(list.length>10||list.some(v=>!/^\S+@[^\s@,]+\.[^\s@,]+$/.test(v)||/[<>;\r\n]/.test(v)))throw Error('Enter up to 10 email addresses separated by commas.');
 return list.join(',');
}
async function zohoMail(req,res){
 const action=req.query.action||'status';
 if(action==='status'&&req.method==='GET')return res.status(200).json({configured:configured(),mailbox:MAILBOX,missing:required.filter(k=>!process.env[k])});
 if(!configured()||!numeric(process.env.ZOHO_MAIL_ACCOUNT_ID))return res.status(409).json({error:'Connect the Zoho mailbox before using email.'});
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 try{
  if(action==='folders'&&req.method==='GET')return res.status(200).json(await call('/folders'));
  if(action==='messages'&&req.method==='GET'){
   if(!numeric(req.query.folder))return res.status(400).json({error:'Choose a mailbox folder.'});
   const start=Number(req.query.start||1);if(!Number.isSafeInteger(start)||start<1||start>100000)return res.status(400).json({error:'Invalid page'});
   return res.status(200).json(await call('/messages/view?folderId='+req.query.folder+'&start='+start+'&limit=25&includeto=true'));
  }
  if(action==='message'&&req.method==='GET'){
   if(!numeric(req.query.folder)||!numeric(req.query.message))return res.status(400).json({error:'Invalid message'});
   return res.status(200).json(await call('/folders/'+req.query.folder+'/messages/'+req.query.message+'/content'));
  }
  if(['draft','send'].includes(action)&&req.method==='POST'){
   const b=req.body||{};let payload;
   try{
    if(typeof b.subject!=='string'||!b.subject.trim()||b.subject.length>250||/[\r\n]/.test(b.subject))throw Error('Enter a subject of up to 250 characters.');
    if(typeof b.content!=='string'||!b.content.trim()||b.content.length>50000)throw Error('Enter a message of up to 50,000 characters.');
    payload={fromAddress:MAILBOX,toAddress:recipients(b.to),ccAddress:recipients(b.cc,true),bccAddress:recipients(b.bcc,true),subject:b.subject.trim(),content:b.content,mailFormat:'plaintext',encoding:'UTF-8',askReceipt:'no',...(action==='draft'?{mode:'draft'}:{})};
   }catch(err){return res.status(400).json({error:err.message})}
   if(action==='send'&&b.confirmSend!==true)return res.status(400).json({error:'Review the recipient and message before sending.'});
   const result=await call('/messages',payload);
   return res.status(200).json({ok:true,messageId:result?.messageId,message:action==='draft'?'New draft saved in Zoho.':'Zoho accepted the email. Delivery is not yet confirmed.'});
  }
  return res.status(400).json({error:'Unknown mailbox action'});
 }catch(_){return res.status(502).json({error:req.method==='POST'?'Zoho did not confirm this action. Check Drafts or Sent in Zoho before retrying to avoid duplicates.':'Could not load Zoho Mail. Check the connection and permissions.'})}
}
module.exports={zohoMail};
