window.mountCustomerSuccess=async(container,api,tasks)=>{
 const stamp=crypto.randomUUID();container.dataset.success=stamp;container.textContent='Loading customer follow-ups…';
 const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n};
 try{const rows=await api('customer-success');if(container.dataset.success!==stamp||location.hash!=='#customer-success')return;
 container.replaceChildren(el('p','Follow-ups are suggestions based on account activity and trial dates. Creating a task does not send an email. Quote counts include saved revisions (up to 10,000 across the workspace).'));
 const filter=el('input');filter.type='search';filter.placeholder='Find a company';filter.setAttribute('aria-label','Find a company');container.append(filter);const results=el('div');container.append(results);
 function draw(){results.replaceChildren();for(const a of rows.filter(a=>a.name.toLowerCase().includes(filter.value.toLowerCase())).sort((a,b)=>b.flags.length-a.flags.length)){
 const card=el('article');card.className='panel';card.append(el('h2',a.name),el('p',`${a.plan} · ${a.billing_status||'No subscription status'} · ${a.quote_count} quote revisions`),el('p','Last app activity: '+(a.last_seen_at?new Date(a.last_seen_at).toLocaleString():'Not recorded')),el('p','Trial end: '+(a.trial_ends_at||'Not applicable')));
 for(const flag of a.flags){const row=el('p'),label=el('strong',flag+' '),button=el('button','Create follow-up task');button.className='secondary';let existing=tasks.find(t=>t.account_id===a.id&&t.title===flag&&t.status!=='done');if(existing){button.textContent='Task already open';button.disabled=true}
 button.onclick=async()=>{button.disabled=true;try{const task=await api('tasks','POST',{account_id:a.id,title:flag,owner_name:'',due_date:new Date().toLocaleDateString('en-CA'),status:'todo',notes:'Created from Customer follow-ups. Review the current account before contacting the customer.'});tasks.push(task);button.textContent='Task created — assign under Tasks & planning'}catch(e){button.disabled=false;button.textContent=e.message}};row.append(label,button);card.append(row)}
 if(!a.flags.length)card.append(el('p','No current follow-up flags.'));
 const pay=el('button','Check payment method'),state=el('p','Payment method: not checked');pay.className='secondary';state.setAttribute('role','status');pay.onclick=async()=>{pay.disabled=true;try{const p=await api('payment-method','GET',null,a.id);state.textContent=({configured:'A default payment method is configured',not_configured:'No default payment method is configured',no_customer:'No Stripe customer exists'})[p.state]+(p.mode?' · '+p.mode.toUpperCase()+' mode':'')+(p.subscription_status?' · subscription: '+p.subscription_status:'')+(p.cancel_at_period_end?' · cancellation scheduled':'')+'. This does not guarantee a successful charge.'}catch(e){state.textContent=e.message}finally{pay.disabled=false}};card.append(pay,state);results.append(card)}
 if(!results.children.length)results.textContent='No matching active companies.'}
 filter.oninput=draw;draw();
 }catch(e){container.textContent=e.message}
};
