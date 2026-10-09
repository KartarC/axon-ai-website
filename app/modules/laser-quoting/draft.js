// One recoverable working draft per user/company. Revisions remain immutable.
export function draftController({get,post,capture,restore,notice}){
 let version=0,ready=false,blocked=false,timer,queue=Promise.resolve(),pending=0;
 const status=document.getElementById('draftStatus'),panel=document.getElementById('draftRecovery');
 const say=s=>status.textContent=s;const lock=value=>{document.getElementById('quoteForm').inert=value;document.getElementById('file').disabled=value};
 function write(payload){clearTimeout(timer);timer=null;pending++;say('Saving working draft…');queue=queue.then(async()=>{if(blocked)throw Error('Draft saving is paused. Reload to recover the latest draft.');const r=await post('/api/laser-quotes?action=draft',{version,payload});version=r.version;say(payload?'Working draft saved · '+new Date(r.updated_at).toLocaleTimeString():'Working draft cleared.');return true}).catch(e=>{blocked=true;say(e.message+' Your current form is still open.');return false}).finally(()=>pending--);return queue}
 async function init(){try{const d=await get('/api/laser-quotes?action=draft');version=d.version;ready=true;if(d.payload){panel.hidden=false;lock(true);say('A saved working draft is available. Restore or discard it before starting.');document.getElementById('restoreDraft').onclick=async()=>{try{await restore(d.payload);panel.hidden=true;lock(false);say('Draft restored. Recalculate and review before saving a revision.')}catch(e){notice(e.message,true)}};document.getElementById('discardDraft').onclick=async()=>{if(confirm('Discard your saved working draft?')&&await write(null)){panel.hidden=true;lock(false);notice('Working draft discarded.')}}}else say('Working draft autosave is ready.')}catch(e){blocked=true;say('Draft recovery unavailable. Reload before editing to avoid overwriting saved work.')}}
 function changed(){if(!ready||blocked||!panel.hidden)return;clearTimeout(timer);say('Unsaved working changes…');timer=setTimeout(()=>{timer=null;write(capture())},900)}
 async function clear(){if(!ready||blocked)return false;const ok=await write(null);if(ok)panel.hidden=true;return ok}
 function canReplace(){return ready&&!blocked&&panel.hidden}
 addEventListener('beforeunload',e=>{if(pending||timer||blocked){e.preventDefault();e.returnValue=''}});
 // Clear the timer handle before queuing a save so the leave warning can settle.
 const originalChanged=changed;
 return{init,changed(){originalChanged();},clear,canReplace,flush(){clearTimeout(timer);timer=null;return write(capture())}};
}
