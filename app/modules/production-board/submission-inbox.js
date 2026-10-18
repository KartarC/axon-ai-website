import {requireModule} from '../../_shared/auth.js'
import {apiGet} from '../../_shared/api.js'
const session=requireModule('production-board')
export async function inbox(){const el=document.getElementById('submissionInbox');if(!el||!session||!['owner','admin','manager'].includes(session.role))return;try{const {pending}=await apiGet('/api/jobs?action=time-submissions&inbox=1');el.replaceChildren();if(!pending.length){el.textContent='No employee submissions waiting for review.';return}el.append(document.createTextNode(pending.length+' employee timesheet submission(s) need attention: '));for(const week of [...new Set(pending.map(x=>x.week_start))]){const a=document.createElement('a');a.href='timesheets.html?week='+encodeURIComponent(week);a.textContent='Week of '+week+' ';el.append(a)}}catch{el.textContent='Unable to load submission notifications. Refresh to retry.'}}
inbox()
window.addEventListener('timesheets-changed',inbox)
