import {getSession} from './auth.js';
let installed=false,lastInteraction=Date.now();
export function installEngagement(){if(installed)return;installed=true;
 const touch=()=>{lastInteraction=Date.now()};for(const event of ['pointerdown','keydown','scroll','touchstart'])addEventListener(event,touch,{passive:true});
 async function ping(){if(document.visibilityState!=='visible'||Date.now()-lastInteraction>120000)return;const s=getSession();if(!s)return;try{await fetch('/api/engagement?action=presence',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.token},body:JSON.stringify({page:location.pathname})})}catch(_){}}
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){touch();ping()}});ping();setInterval(ping,60000);
}
