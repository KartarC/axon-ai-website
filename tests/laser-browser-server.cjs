// Local browser integration fixture. Uses the real handler and an isolated PostgreSQL database.
const fs=require('fs'),path=require('path'),http=require('http'),vm=require('vm')
const {setup}=require('./database-laser.cjs')
const root=path.resolve(__dirname,'..'),A='10000000-0000-4000-8000-000000000001',U='20000000-0000-4000-8000-000000000001'
async function start(options={}){
 const db=await setup(options.dataDir);await db.exec(`insert into accounts values('${A}') on conflict do nothing;insert into auth.users values('${U}') on conflict do nothing;insert into account_users select '${A}','${U}','owner' where not exists(select 1 from account_users where account_id='${A}' and user_id='${U}');set role service_role;`)
 async function sb(method,url,body){
  if(url.startsWith('rpc/')){const fn=url.slice(4);if(!['billet_laser_save','billet_laser_status'].includes(fn))throw Error('Unexpected RPC');const values=Object.values(body);return(await db.query(`select public.${fn}(${values.map((_,i)=>'$'+(i+1)).join(',')}) as r`,values)).rows[0].r}
  const [table,search='']=url.split('?');if(!['billet_laser_quotes','billet_laser_profiles','billet_laser_imports'].includes(table))throw Error('Unexpected table')
  if(method==='POST'){const keys=Object.keys(body);return(await db.query(`insert into public.${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,Object.values(body))).rows}
  const params=new URLSearchParams(search),values=[],where=[]
  for(const key of ['id','account_id','sha256','name']){if(params.has(key)){const v=params.get(key);if(!v.startsWith('eq.'))throw Error('Unexpected filter');values.push(v.slice(3));where.push(key+'=$'+values.length)}}
  if(method==='PATCH'){const keys=Object.keys(body),offset=values.length;values.push(...Object.values(body));return(await db.query(`update public.${table} set ${keys.map((k,i)=>k+'=$'+(offset+i+1)).join(',')} where ${where.join(' and ')} returning *`,values)).rows}
  let select='*';if(params.has('select'))select="id,family_id,revision,customer,reference,status,created_at,result->>'price' as price,result->>'currency' as currency"
  const order=params.get('order')==='updated_at.desc'?'updated_at desc':params.get('order')==='name.asc'?'name asc':params.get('order')==='created_at.desc'?'created_at desc':'id'
  if(method!=='GET')throw Error('Unexpected write')
  return(await db.query(`select ${select} from public.${table} where ${where.join(' and ')||'true'} order by ${order} limit 100`,values)).rows
 }
 const account={id:A,name:'Test Manufacturing',plan:'suite',modules:options.modules||['job-costing'],status:'active'}
 const deps={sb,cors(){},requireAuth:async(req,res)=>{if(req.headers.authorization!=='Bearer test-token'){res.status(401).json({error:'Test session required'});return null}return{user:{id:U},account,role:'owner'}},requireRole:(ctx,roles,res)=>{if(roles.includes(ctx.role))return true;res.status(403).json({error:'Forbidden'});return false}}
 const context={Buffer,console,require:n=>n==='./_lib/supabase'?deps:require(path.resolve(root,'api',n))}
 vm.createContext(context);vm.runInContext(fs.readFileSync(root+'/api/laser-quotes.js','utf8').replace('export const config','const config').replace('export default async function handler','async function handler')+';this.handler=handler',context)
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');if(url.pathname==='/api/laser-quotes'){const chunks=[];for await(const chunk of req)chunks.push(chunk);req.body=chunks.length?JSON.parse(Buffer.concat(chunks)):{};req.query=Object.fromEntries(url.searchParams);res.status=n=>{res.statusCode=n;return res};res.json=v=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v))};await context.handler(req,res);return}
  let p=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return}if(fs.statSync(p).isDirectory())p=path.join(p,'index.html');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p))
 }catch(e){res.writeHead(500).end('Local fixture error');console.error(e.message)}})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 return{db,url:'http://127.0.0.1:'+server.address().port,account,user:{id:U},close:async()=>{await new Promise(resolve=>server.close(resolve));await db.close()}}
}
module.exports={start}
