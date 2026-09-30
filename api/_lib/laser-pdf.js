const {PDFDocument,StandardFonts,rgb}=require('pdf-lib')
function invalid(message){const error=new Error(message);error.status=400;throw error}
// Only the explicit customer-facing projection is passed to the document renderer.
function customerQuote(q){return {
 number:'LQ-'+q.family_id.slice(0,8).toUpperCase(),revision:q.revision,status:q.status,
 date:q.issued_at||q.created_at,validDays:q.valid_days,customer:q.customer,reference:q.reference,
 terms:q.terms,company:q.result.identity?.company||{},user:q.result.identity?.user||{},
 material:q.source.material,thickness:q.source.thicknessMm,program:q.source.program,
 parts:q.source.parts.map(p=>({name:p.name,width:p.widthMm,height:p.heightMm,quantity:p.nested})),
 total:q.result.price,currency:q.result.currency
}}
async function quotePdf(quote){
 const q=customerQuote(quote)
 if(!q.company.name||!q.user.name)invalid('Save your company and user profiles, then save a new quote revision before downloading its PDF.')
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold)
 const page=doc.addPage([595.28,841.89]),ink=rgb(.12,.17,.23),muted=rgb(.36,.40,.45)
 doc.setTitle(q.number+' - Revision '+q.revision);doc.setAuthor(q.company.name);doc.setCreator('Billet Laser Quoting')
 let y=794
 const clean=value=>String(value??'').replace(/[\t\r]/g,' ').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'')
 function lines(value,width,size,f=font){const output=[];for(const paragraph of clean(value).split('\n')){let line='';for(const word of paragraph.split(/\s+/)){let candidate=line?line+' '+word:word;if(f.widthOfTextAtSize(candidate,size)<=width){line=candidate;continue}if(line)output.push(line);line='';for(const char of word){if(f.widthOfTextAtSize(line+char,size)>width){output.push(line);line=''}line+=char}}output.push(line)}return output}
 function text(value,{size=10,strong=false,color=ink,gap=5}={}){const f=strong?bold:font;for(const line of lines(value,499,size,f)){if(y<55)invalid('This quote contains too much text for one page. Shorten the terms or contact details and save a new revision.');page.drawText(line,{x:48,y,size,font:f,color});y-=size+4}y-=gap}
 function rule(){page.drawLine({start:{x:48,y},end:{x:547,y},thickness:1,color:rgb(.83,.86,.89)});y-=18}
 try{
  text(q.company.name,{size:21,strong:true,gap:3})
  for(const value of [q.company.address,[q.company.email,q.company.phone].filter(Boolean).join('  |  '),q.company.website])if(value)text(value,{size:9,color:muted,gap:0})
  y-=12;rule();text('QUOTATION'+(q.status==='draft'?'  /  DRAFT':''),{size:17,strong:true})
  const date=new Date(q.date),expiry=new Date(date.getTime()+q.validDays*86400000)
  text(q.number+'  |  Revision '+q.revision+'  |  '+date.toISOString().slice(0,10)+'  |  Valid until '+expiry.toISOString().slice(0,10),{size:9,color:muted})
  text('Prepared for: '+q.customer,{size:12,strong:true})
  if(q.reference)text('Reference: '+q.reference,{size:9})
  text('Laser cutting  |  '+q.material+'  |  '+q.thickness+' mm',{size:10,strong:true});rule()
  const quantity=q.parts.reduce((sum,p)=>sum+p.quantity,0)
  if(q.parts.length<=8&&q.parts.every(p=>p.name.length<=50)){
   for(const [label,x] of [['PART',48],['SIZE (mm)',340],['QTY',520]])page.drawText(label,{x,y,size:8,font:bold,color:muted});y-=22
   for(const p of q.parts){
    const nameLines=lines(p.name,270,10);if(y-nameLines.length*14<70)invalid('This part list is too long for one page. Shorten the part names in the source report.')
    nameLines.forEach((line,i)=>page.drawText(line,{x:48,y:y-i*14,size:10,font,color:ink}))
    page.drawText(p.width+' x '+p.height,{x:340,y,size:10,font,color:ink})
    const qty=String(p.quantity);page.drawText(qty,{x:547-font.widthOfTextAtSize(qty,10),y,size:10,font,color:ink});y-=nameLines.length*14+8
   }
  }else{
   text('Complete cutting batch: '+q.parts.length+' part types / '+quantity+' pieces',{size:11,strong:true})
   text('Scope: all nested parts in report '+q.program+'. Detailed part list remains with the saved quotation.',{size:9,color:muted})
  }
  y-=4;rule();text('BATCH TOTAL     '+q.currency+' '+Number(q.total).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2}),{size:20,strong:true})
  text('Taxes excluded. Price applies to the complete batch of '+quantity+' pieces.',{size:9,color:muted})
  if(q.terms){text('TERMS',{size:9,strong:true});text(q.terms,{size:9,gap:8})}
  text('Prepared by: '+q.user.name+(q.user.title?' / '+q.user.title:''),{size:10,strong:true})
  const contact=[q.user.email,q.user.phone].filter(Boolean).join('  |  ');if(contact)text(contact,{size:9,color:muted})
  text('Price reflects material, processing, estimated utilities and the stated commercial terms.',{size:8,color:muted})
  page.drawText(q.number+' / Rev '+q.revision,{x:48,y:30,size:8,font,color:muted});page.drawText('1 / 1',{x:528,y:30,size:8,font,color:muted})
 }catch(error){if(error.status)throw error;invalid('A character in this quote is not supported by the PDF font. Use Latin-script text for this version and save a new revision.')}
 return Buffer.from(await doc.save())
}
module.exports={quotePdf,customerQuote}
