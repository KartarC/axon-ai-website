
(()=>{
 const token=location.hash.slice(1),notice=document.getElementById('notice'),form=document.getElementById('response');let requestId=crypto.randomUUID(),busy=false;
 window.addEventListener('hashchange',()=>location.reload());
 const labels={accepted:'Acceptance recorded',declined:'Decline recorded',changes_requested:'Change request recorded'};
 async function call(body){const r=await fetch('/api/quote-review',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({token,...body})});const data=await r.json();if(!r.ok)throw Error(data.error||'Could not load quotation.');return data}
 function show(q){const target=document.getElementById('quote');window.renderCustomerQuote(q,target);target.hidden=false;form.hidden=!q.can_respond;document.getElementById('print').hidden=false;notice.textContent=q.response?labels[q.response]+'. The sender can review your response in Ovrendi.':q.can_respond?'Please review your quotation below.':'This quotation is '+q.status+' and is not awaiting a response.'}
 form.elements.decision.onchange=()=>{const needed=form.elements.decision.value==='changes_requested';form.elements.message.required=needed;document.getElementById('messageLabel').textContent=needed?'Requested changes · required':'Message · optional';requestId=crypto.randomUUID()};
 form.addEventListener('input',()=>{requestId=crypto.randomUUID()});
 form.onsubmit=async e=>{e.preventDefault();if(busy||!form.reportValidity())return;const data=Object.fromEntries(new FormData(form));if(!confirm('Submit this response to the quotation? No payment will be taken.'))return;busy=true;form.inert=true;notice.textContent='Saving your response…';try{show(await call({action:'respond',...data,confirmed:form.elements.confirmed.checked,request_id:requestId}))}catch(e){notice.textContent=e.message}finally{busy=false;form.inert=false}};
 document.getElementById('print').onclick=()=>window.print();
 if(!/^[a-f0-9]{64}$/.test(token)){notice.textContent='This quotation link is incomplete. Ask the sender for a new link.';return}
 call({action:'read'}).then(show).catch(e=>{notice.textContent=e.message});
})();
