const {sb}=require('./supabase');const {isUuid}=require('./security');
function signals(a,users,quotes,now=Date.now()){
 const activity=users.filter(u=>u.account_id===a.id),last=Math.max(0,...activity.map(u=>Date.parse(u.last_seen_at)||0));
 const days=a.trial_ends_at?Math.ceil((Date.parse(a.trial_ends_at+'T00:00:00Z')+86400000-now)/86400000):null;
 const flags=[];if(!activity.length)flags.push('Invite first user');else if(!last)flags.push('First sign-in / setup');else if(now-last>7*86400000)flags.push('Inactive for 7+ days');
 if(!quotes.length&&a.modules.some(m=>['laser-quoting','job-costing'].includes(m)))flags.push('Create first quotation');
 if(a.plan==='trial'&&days!==null&&days<=14)flags.push(days<=0?'Trial ended':`Trial ends in ${days} day${days===1?'':'s'}`);
 if(['past_due','unpaid','incomplete'].includes(a.billing_status))flags.push('Review billing');
 return{...a,last_seen_at:last?new Date(last).toISOString():null,quote_count:quotes.length,trial_days_left:days,flags};
}
async function customerSuccess(req,res){try{
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(req.query.resource==='customer-success'){
  const [accounts,users,quotes]=await Promise.all([sb('GET','accounts?select=id,name,plan,status,modules,trial_ends_at,billing_status,stripe_subscription_id&order=name.asc&limit=1000'),sb('POST','rpc/ovrendi_customer_activity',{}),sb('GET','billet_laser_quotes?select=account_id&limit=10000')]);
  return res.status(200).json(accounts.filter(a=>a.status==='active').map(a=>signals(a,users,quotes.filter(q=>q.account_id===a.id))));
 }
 if(!isUuid(req.query.id))return res.status(400).json({error:'Invalid company ID'});
 const [a]=await sb('GET','accounts?id=eq.'+req.query.id+'&select=stripe_customer_id,stripe_subscription_id');if(!a)return res.status(404).json({error:'Company not found'});
 const key=process.env.STRIPE_SECRET_KEY;if(!key)return res.status(200).json({state:'not_configured'});
 if(!a.stripe_customer_id)return res.status(200).json({state:'no_customer',mode:key.startsWith('sk_live_')?'live':'test'});
 async function get(path){const r=await fetch('https://api.stripe.com/v1/'+path,{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Stripe lookup failed');return r.json();}
 const c=await get('customers/'+encodeURIComponent(a.stripe_customer_id));
 const sub=a.stripe_subscription_id?await get('subscriptions/'+encodeURIComponent(a.stripe_subscription_id)):null;
 const present=!!(sub?.default_payment_method||sub?.default_source||c.invoice_settings?.default_payment_method||c.default_source);
 return res.status(200).json({state:present?'configured':'not_configured',mode:c.livemode?'live':'test',subscription_status:sub?.status||'none',cancel_at_period_end:sub?.cancel_at_period_end||false,checked_at:new Date().toISOString()});
 }catch(_){return res.status(503).json({error:'Could not check customer follow-up or billing. Please retry.'});}}
module.exports={customerSuccess,signals};
