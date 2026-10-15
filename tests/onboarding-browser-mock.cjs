module.exports=async(page,identity=()=>({account:'a',user:'u'}))=>{
 const records=new Map();
 await page.route('**/api/auth?action=onboarding',async route=>{
  const c=identity(),key=c.account+':'+c.user;let rows=records.get(key);if(!rows){rows=new Map();records.set(key,rows)}
  if(route.request().method()==='PATCH'){const v=route.request().postDataJSON();if(!v.import_local||!rows.has(v.task_id))rows.set(v.task_id,v);return route.fulfill({json:{ok:true}})}
  return route.fulfill({json:{tasks:[...rows.values()],allowed_tasks:['company','quoting-rates','quoting-first','production-first','costing-first','traveler-first']}})
 })
}
