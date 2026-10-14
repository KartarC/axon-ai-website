const assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
const {chromium}=require(root+'/tests/node_modules/playwright');
const {start}=require(root+'/tests/laser-browser-server.cjs');
(async()=>{const app=await start({modules:['laser-quoting']}),browser=await chromium.launch({headless:true,executablePath:process.env.BILLET_BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
for(const fallback of [false,true]){
const context=await browser.newContext(),p=await context.newPage();let posts=0,sessionFails=fallback;
await p.route('**/api/engagement**',r=>r.fulfill({json:{ok:true}}));
await p.route('**/auth/v1/token**',r=>r.fulfill({json:{access_token:'test-token',refresh_token:'test-refresh'}}));
await p.route('**/api/auth?**',r=>{const action=new URL(r.request().url()).searchParams.get('action');if(action==='session'){if(sessionFails){sessionFails=false;return r.fulfill({status:503,json:{error:'Temporary error'}})}return r.fulfill({json:{account:app.account,user:app.user,role:'owner'}})}
if(r.request().method()==='GET')return r.fulfill({json:{email:'test@example.invalid',role:'owner',account_name:'Test Manufacturing',plan:'trial'}});
posts++;assert.equal(r.request().postDataJSON().password,'Test-password-2026');return r.fulfill({json:{ok:true,auto_login:true,access_token:'test-token',refresh_token:'test-refresh'}})});
await p.goto(app.url+'/app/accept-invite.html?token='+'a'.repeat(64));await p.locator('#pw').fill('short');await p.locator('#pw2').fill('short');await p.locator('#submitBtn').click();await p.getByRole('alert').filter({hasText:'at least 8'}).waitFor();assert.equal(posts,0);
await p.locator('#pw').fill('Test-password-2026');await p.locator('#pw2').fill('different');await p.locator('#submitBtn').click();await p.getByRole('alert').filter({hasText:'do not match'}).waitFor();assert.equal(posts,0);
await p.locator('#pw2').fill('Test-password-2026');await p.locator('#submitBtn').click();
if(fallback){await p.waitForURL('**/app/login.html?*');await p.getByText('Your invitation has been accepted.',{exact:false}).waitFor();await p.locator('#email').fill('test@example.invalid');await p.locator('#password').fill('Test-password-2026');await p.locator('#submitBtn').click();}
await p.waitForURL('**/app/getting-started.html');assert.equal(await p.locator('[data-step]').count(),3);assert.equal(posts,1);await p.locator('[data-step="0"]').check();await p.reload();assert(await p.locator('[data-step="0"]').isChecked());await context.close();
}
const p=await browser.newPage();await p.goto(app.url+'/app/accept-invite.html');await p.getByText('No invite token found. Check your email link.').waitFor();assert.equal(await p.locator('#pw').count(),0);
console.log('PASS: invitation validation, password mismatch, acceptance to Getting Started, fallback login return, checklist persistence, missing-token state. Network identity responses are isolated fixtures.');
}finally{await browser.close();await app.close();}})().catch(e=>{console.error(e);process.exitCode=1});
