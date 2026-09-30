// Synthetic workbook using the supplied report's numeric acceptance cases.
// No original workbook, images or customer identifiers are committed.
const rows=[
  ['B1','Order Name:','B2','Synthetic test'],
  ['B3','Program Name','F3','Synthetic test','I3','Program Date','K3','2026-09-30'],
  ['B4','Sheet size','F4','3048*1524','I4','Processing Qt.','K4','1'],
  ['B5','Using Size','F5','1287.49*1438.53','I5','Parts Weight','K5','28.43','M5','Cutting gas','R5','O2'],
  ['B6','Sheet type','F6','MS','I6','Sheet Th','K6','3','M6','Move Cost','R6','6.56'],
  ['B7','Cutting Length','F7','80422.76','I7','Cutting time','K7','00:26:10:201','M7','Cutting Cost','R7','80.42'],
  ['B8','Perfor Qt.','F8','403','I8','Perfor time','K8','00:06:43:000','M8','Perfor Cost','R8','201.5'],
  ['B9','Move Length','F9','32803.99','I9','Move time','K9','00:02:35:785','M9','Material Cost','R9','217.39'],
  ['B10','Utilization rate','F10','26.16','I10','Total time','K10','00:35:28:986','M10','Total Cost','R10','505.87'],
  ['B12','Nm.','G12','Part Name','J12','Size','L12','Per/KG','N12','Request Qt','Q12','Nest Qt.','S12','Per Qt.'],
  ['B14','1','G14','Part A','J14','80*69.28','L14','0.08','N14','121','Q14','121','S14','1'],
  ['B15','2','G15','Part B','J15','110*100','L15','0.22','N15','50','Q15','50','S15','5'],
  ['B16','4','G16','Part C','J16','200*200','L16','0.54','N16','9','Q16','9','S16','2'],
  ['B17','5','G17','Part D','J17','199.85*123.97','L17','0.27','N17','7','Q17','7','S17','2']
]
function crc32(buffer){let crc=0xffffffff;for(const b of buffer){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return(crc^0xffffffff)>>>0}
function zip(files){const local=[],central=[];let offset=0;for(const [name,text]of Object.entries(files)){const data=Buffer.from(text),n=Buffer.from(name),h=Buffer.alloc(30),c=Buffer.alloc(46);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt32LE(crc32(data),14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(crc32(data),16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);local.push(h,n,data);central.push(c,n);offset+=h.length+n.length+data.length}const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(central.length/2,8);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end])}
const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
function files(overrides={}){const data=rows.map(row=>'<row>'+row.reduce((a,v,i)=>i%2?a:a+`<c r="${v}" t="inlineStr"><is><t>${escape(row[i+1])}</t></is></c>`,'')+'</row>').join('');return{
 'xl/workbook.xml':'<workbook><sheets><sheet name="Page1" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':'<worksheet><sheetData>'+data+'</sheetData></worksheet>',...overrides}}
function rates(overrides={}){return{currency:'CAD',method:'shop',materialMode:'sheet',sheetPrice:'200',remnantCredit:'0',machineHourly:'60',setupMinutes:'0',laborMinutes:'0',gasMode:'pack',packPrice:'100',bottles:'10',volumePerBottle:'10',usablePct:'100',gasFlowLmin:'100',pierceFlowLmin:'50',purgeSeconds:'0',electricityMode:'estimate',powerKw:'10',energyPrice:'0.1',otherCost:'0',pricing:'margin',percentage:'20',minimumCharge:'0',...overrides}}
module.exports={rows,zip,files,rates,sample:()=>zip(files())}
