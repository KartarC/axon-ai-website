// Mail is untrusted content: render only text; never execute email markup or fetch remote images.
window.mountOvrendiMailbox = async function(root,api,contacts=[]) {
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 root.innerHTML='<section class="panel"><h2>Company mailbox</h2><p>hello@getovrendi.com · Zoho Mail</p><p id="mailStatus" role="status">Checking connection…</p><div id="mailArea"></div></section>';
 const notice=root.querySelector('#mailStatus'),area=root.querySelector('#mailArea');
 const active=()=>notice.isConnected;
 const request=(action,method='GET',body)=>api('mailbox&action='+action,method,body);
 try{
  const status=await request('status');if(!active())return;
  if(!status.configured){notice.textContent='Mailbox setup required';area.innerHTML='<p>A Zoho administrator must authorize this mailbox. Email passwords are not collected here.</p><p><a href="https://getovrendi.com/docs/ZOHO_MAIL_SETUP.md" target="_blank" rel="noopener noreferrer">Open the Zoho connection setup guide</a>. Once configured, refresh this page.</p>';return;}
  const folders=await request('folders');if(!active())return;
  notice.textContent='Connected. Select a folder to load messages.';
  area.innerHTML=`<div class="toolbar"><label>Folder<select id="mailFolder">${folders.map(f=>`<option value="${esc(f.folderId)}">${esc(f.folderName||f.path)}</option>`).join('')}</select></label><button type="button" id="mailReload" class="secondary">Refresh messages</button></div><div id="mailList"></div><div class="toolbar"><button id="mailPrevious" class="secondary">Previous page</button><button id="mailNext" class="secondary">Next page</button></div><article id="mailReader" class="panel" hidden></article><form id="mailCompose" class="panel"><h3>Compose email</h3><p>Codex can prepare this message when you ask. Review it before sending. Drafts are saved as new messages in Zoho.</p><label>To *<input name="to" required maxlength="2000" placeholder="customer@example.com"></label><label>CC (optional)<input name="cc" maxlength="2000"></label><label>BCC (optional)<input name="bcc" maxlength="2000"></label><label>Subject *<input name="subject" required maxlength="250"></label><label>Message *<textarea name="content" required maxlength="50000" rows="12"></textarea></label><div class="toolbar"><button type="submit" value="draft" class="secondary">Save new draft</button><button type="submit" value="send">Review and send</button></div><p id="composeStatus" role="status"></p></form><p>Messages stay in Zoho. Refresh to check new mail. Attachments and threaded replies can be managed in <a href="https://mail.zohocloud.ca" target="_blank" rel="noopener noreferrer">Zoho Mail</a>.</p>`;
  const folder=area.querySelector('#mailFolder'),list=area.querySelector('#mailList'),reader=area.querySelector('#mailReader'),form=area.querySelector('#mailCompose');
  const inbox=folders.find(f=>String(f.folderName).toLowerCase()==='inbox');if(inbox)folder.value=String(inbox.folderId);
  let start=1,items=[],generation=0,reading=0;
  async function load(){const version=++generation;reading++;reader.hidden=true;list.textContent='Loading messages…';notice.textContent='Loading…';
   try{const rows=await request('messages&folder='+encodeURIComponent(folder.value)+'&start='+start);if(!active()||version!==generation)return;items=rows||[];
    list.innerHTML=items.length?'<ul class="mail-messages">'+items.map((m,i)=>`<li><button class="secondary" data-message="${i}"><strong>${esc(m.subject||'(No subject)')}</strong><span>${esc(m.fromAddress)}</span></button></li>`).join('')+'</ul>':'<p>No messages in this page.</p>';
    area.querySelector('#mailPrevious').disabled=start===1;area.querySelector('#mailNext').disabled=items.length<25;notice.textContent='Showing '+items.length+' messages.';
   }catch(e){if(active()&&version===generation){notice.textContent=e.message;list.textContent='Messages unavailable.'}}}
  folder.onchange=()=>{start=1;load()};area.querySelector('#mailReload').onclick=load;area.querySelector('#mailPrevious').onclick=()=>{start=Math.max(1,start-25);load()};area.querySelector('#mailNext').onclick=()=>{start+=25;load()};
  list.onclick=async e=>{const button=e.target.closest('[data-message]');if(!button)return;const m=items[Number(button.dataset.message)],version=++reading;reader.hidden=false;reader.textContent='Loading message…';try{
   const result=await request('message&folder='+encodeURIComponent(m.folderId||folder.value)+'&message='+encodeURIComponent(m.messageId));if(!active()||version!==reading)return;
   const template=document.createElement('template');template.innerHTML=result.content||'';template.content.querySelectorAll('script,style,iframe,object,embed').forEach(el=>el.remove());template.content.querySelectorAll('br').forEach(el=>el.replaceWith(document.createTextNode('\n')));
   const text=template.content.textContent||'';
   const matches=contacts.filter(c=>c.email&&c.email.toLowerCase()===String(m.fromAddress).toLowerCase());
   reader.innerHTML='<h3>'+esc(m.subject||'(No subject)')+'</h3><p>From: '+esc(m.fromAddress)+'</p>'+(matches.length?'<p>CRM contact: '+matches.map(c=>esc(c.name)).join(', ')+'</p>':'')+'<pre class="mail-body"></pre><button type="button" class="secondary" id="mailCopy">Use in new message</button>';
   reader.querySelector('pre').textContent=text;reader.querySelector('#mailCopy').onclick=()=>{form.elements.to.value=m.fromAddress||'';form.elements.subject.value='Re: '+(m.subject||'');form.elements.content.value='\n\n--- Original message ---\n'+text;form.scrollIntoView({block:'start'})};
  }catch(err){if(active()&&version===reading)reader.textContent=err.message}};
  let submitting=false;
  form.onsubmit=async e=>{e.preventDefault();if(submitting)return;const action=e.submitter?.value;if(!['draft','send'].includes(action))return;const body=Object.fromEntries(new FormData(form));
   if(action==='send'&&!confirm('Send this email from hello@getovrendi.com?\nTo: '+body.to+'\nCC: '+(body.cc||'None')+'\nBCC: '+(body.bcc||'None')+'\nSubject: '+body.subject))return;
   body.confirmSend=action==='send';submitting=true;form.querySelectorAll('button').forEach(b=>b.disabled=true);const resultNotice=area.querySelector('#composeStatus');resultNotice.textContent=action==='draft'?'Saving draft…':'Sending…';
   try{const result=await request(action,'POST',body);if(!active())return;resultNotice.textContent=result.message;if(action==='send')form.reset();}
   catch(err){if(active())resultNotice.textContent=err.message}
   finally{submitting=false;if(active())form.querySelectorAll('button').forEach(b=>b.disabled=false)}
  };
  await load();
 }catch(err){if(active())notice.textContent=err.message}
};
