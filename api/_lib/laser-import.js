const yauzl = require('yauzl')
const { XMLParser, XMLValidator } = require('fast-xml-parser')
const crypto = require('node:crypto')
const MAX_FILE = 2 * 1024 * 1024
const MAX_XML = 2 * 1024 * 1024
const arr = x => x == null ? [] : Array.isArray(x) ? x : [x]
function invalid(message) { const e = new Error(message); e.status = 400; throw e }

// Stream only workbook XML. Images and executable content are never loaded.
function readArchive(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_FILE) invalid('Choose a Han’s export under 2 MB.')
  if (buffer.readUInt16LE(0) !== 0x4b50) invalid('This is a legacy .xls file. Re-export from Han’s as an XLSX workbook.')
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (err, zip) => {
      if (err) return reject(Object.assign(new Error('The workbook archive could not be read.'), { status: 400 }))
      const files = {}; let total = 0; let count = 0; let expanded = 0; let done = false
      function fail(message) { if (done) return; done = true; zip.close(); reject(Object.assign(new Error(message), { status: 400 })) }
      zip.on('error', () => fail('The workbook archive is damaged.'))
      zip.on('end', () => { if (!done) { done = true; resolve(files) } })
      zip.on('entry', entry => {
        total += entry.uncompressedSize
        if (++count > 250 || total > 20 * 1024 * 1024 || (entry.generalPurposeBitFlag & 1)) return fail('The workbook exceeds safe import limits or is encrypted.')
        if (!/^(xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml))$/.test(entry.fileName)) return zip.readEntry()
        if (files[entry.fileName] || entry.uncompressedSize > MAX_XML) return fail('The workbook contains duplicate or oversized data.')
        zip.openReadStream(entry, (error, stream) => {
          if (error) return fail('The workbook could not be decompressed.')
          const chunks = []; let size = 0
          stream.on('data', chunk => {
            size += chunk.length; expanded += chunk.length
            if (size > MAX_XML || expanded > 6 * MAX_XML) { stream.destroy(); fail('The workbook expands beyond safe limits.'); return }
            chunks.push(chunk)
          })
          stream.on('error', () => fail('The workbook data is damaged.'))
          stream.on('end', () => { if (!done) { files[entry.fileName] = Buffer.concat(chunks).toString('utf8'); zip.readEntry() } })
        })
      })
      zip.readEntry()
    })
  })
}
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, processEntities: true })
function xml(text) {
  if (!text || /<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true) invalid('The workbook contains unsupported XML.')
  return parser.parse(text)
}
function textOf(node) {
  if (node == null) return ''
  if (typeof node !== 'object') return String(node)
  if (node.t != null) return textOf(node.t)
  if (node['#text'] != null) return String(node['#text'])
  return arr(node.r).map(textOf).join('')
}
function number(value, label, integer = false) {
  if (!/^\d+(?:\.\d+)?$/.test(String(value ?? '').trim())) invalid(`Missing or invalid ${label}.`)
  const n = Number(value)
  if (!Number.isFinite(n) || n > 1e9 || (integer && !Number.isInteger(n))) invalid(`Invalid ${label}.`)
  return n
}
function duration(value) {
  const match = /^(\d{1,4}):(\d{2}):(\d{2}):(\d{3})$/.exec(value)
  if (!match || +match[2] > 59 || +match[3] > 59) invalid('Expected Han’s time format HH:MM:SS:mmm.')
  return +match[1] * 3600 + +match[2] * 60 + +match[3] + +match[4] / 1000
}
function dimensions(value) {
  const pair = String(value).split(/\s*[*×x]\s*/i)
  if (pair.length !== 2) invalid('Invalid sheet or part dimensions.')
  const size = pair.map(v => number(v, 'dimension'))
  if (size.some(v => v <= 0 || v > 100000)) invalid('Dimensions must be positive millimetres.')
  return size
}
function normalizeRows(rows, sourceName, hash) {
  const label = s => String(s).trim().toLowerCase().replace(/[.\s:]+/g, '')
  function value(name) {
    const matches = rows.flatMap(row => row.flatMap((c, i) => label(c.value) === label(name) ? [row[i + 1]?.value] : []))
    if (matches.length !== 1 || matches[0] == null) invalid(`Expected one “${name}” field. This report layout is not supported yet.`)
    return matches[0]
  }
  const partsHeader = rows.findIndex(row => row.some(c => label(c.value) === 'partname'))
  if (partsHeader < 0) invalid('No Han’s parts table found.')
  const columns = Object.fromEntries(rows[partsHeader].map(c => [label(c.value), c.col]))
  for (const key of ['partname','size','per/kg','requestqt','nestqt','perqt']) if (!columns[key]) invalid('Unsupported parts table columns.')
  const parts = []
  for (const row of rows.slice(partsHeader + 1)) {
    const cells = Object.fromEntries(row.map(c => [c.col,c.value]))
    const name = cells[columns.partname]
    if (!name) continue
    if (parts.length >= 500 || String(name).length > 200) invalid('Too many parts or an oversized part name.')
    const size = dimensions(cells[columns.size])
    parts.push({ name, widthMm:size[0], heightMm:size[1], weightKg:number(cells[columns['per/kg']], 'part weight'), requested:number(cells[columns.requestqt], 'requested quantity', true), nested:number(cells[columns.nestqt], 'nested quantity', true), pierces:number(cells[columns.perqt], 'part pierces', true) })
  }
  if (!parts.length || parts.some(p => p.requested <= 0 || p.nested <= 0)) invalid('The report needs positive part quantities.')
  const size = dimensions(value('Sheet size')); const used = dimensions(value('Using Size'))
  const sheetCount = number(value('Processing Qt.'), 'processing quantity', true)
  if (sheetCount !== 1) invalid('This pilot supports one processing run per report. Export a single-run report; repeated-sheet semantics need verification.')
  const source = { parserVersion:1, sourceName, hash, program:String(value('Program Name')).slice(0,200), programDate:value('Program Date'), material:String(value('Sheet type')).slice(0,80), thicknessMm:number(value('Sheet Th'), 'thickness'), gas:String(value('Cutting gas')).slice(0,30), sheetWidthMm:size[0], sheetHeightMm:size[1], usedWidthMm:used[0], usedHeightMm:used[1], sheetCount, partsWeightKg:number(value('Parts Weight'),'parts weight'), utilizationPct:number(value('Utilization rate'),'utilization'), cuttingMm:number(value('Cutting Length'),'cutting length'), travelMm:number(value('Move Length'),'travel length'), pierces:number(value('Perfor Qt.'),'pierces',true), cuttingSeconds:duration(value('Cutting time')), piercingSeconds:duration(value('Perfor time')), travelSeconds:duration(value('Move time')), totalSeconds:duration(value('Total time')), charges:{ material:number(value('Material Cost'),'material charge'), cutting:number(value('Cutting Cost'),'cutting charge'), piercing:number(value('Perfor Cost'),'piercing charge'), travel:number(value('Move Cost'),'travel charge'), total:number(value('Total Cost'),'total charge') }, parts }
  if (source.thicknessMm <= 0 || source.utilizationPct > 100) invalid('Invalid material thickness or utilization.')
  const warnings=[]
  const partMass=parts.reduce((s,p)=>s+p.weightKg*p.nested,0)
  if (Math.abs(partMass-source.partsWeightKg)>.02) warnings.push(`Part weights total ${partMass.toFixed(2)} kg; the report summary says ${source.partsWeightKg.toFixed(2)} kg. Verify before allocating material by weight.`)
  if (parts.some(p=>p.requested!==p.nested)) warnings.push('Requested and nested quantities differ. This quote covers nested quantities only.')
  if (parts.reduce((s,p)=>s+p.nested*p.pierces,0)!==source.pierces) warnings.push('Part pierces do not match the report total.')
  if (Math.abs(source.cuttingSeconds+source.piercingSeconds+source.travelSeconds-source.totalSeconds)>.01) warnings.push('Process times do not match total time.')
  if (Math.abs(Object.entries(source.charges).filter(([k])=>k!=='total').reduce((s,[,v])=>s+v,0)-source.charges.total)>.011) warnings.push('Source charge lines do not match the source total.')
  source.warnings=warnings
  return source
}
async function parseHans(buffer, sourceName='Han’s export') {
  if (buffer.length < 4) invalid('The uploaded file is empty or invalid.')
  const files=await readArchive(buffer)
  const workbook=xml(files['xl/workbook.xml'])
  const sheets=arr(workbook.workbook?.sheets?.sheet)
  if (sheets.length!==1) invalid('This pilot supports a single-sheet Han’s report. Import each report separately.')
  const relationships=arr(xml(files['xl/_rels/workbook.xml.rels']).Relationships?.Relationship)
  const rel=relationships.find(r=>r['@_Id']===sheets[0]['@_r:id'])
  const target=rel?.['@_Target']?.replace(/^\/?xl\//,'').replace(/^\//,'')
  if (rel?.['@_TargetMode']==='External' || !/^worksheets\/sheet\d+\.xml$/.test(target||'')) invalid('Unsupported workbook relationships.')
  const strings=files['xl/sharedStrings.xml']?arr(xml(files['xl/sharedStrings.xml']).sst?.si).map(textOf):[]
  const data=xml(files['xl/'+target]).worksheet?.sheetData
  const rawRows=arr(data?.row)
  if (rawRows.length>1000) invalid('The report has too many rows.')
  let count=0
  const rows=rawRows.map(row=>arr(row.c).map(c=>{
    if (++count>20000 || c.f!==undefined) invalid('Formula cells are not accepted. Export a values-only Han’s report.')
    const ref=/^([A-Z]{1,3})\d{1,7}$/.exec(c['@_r']||'')
    if (!ref) invalid('Invalid workbook cell address.')
    const value=c['@_t']==='s'?strings[Number(c.v)]:c['@_t']==='inlineStr'?textOf(c.is):textOf(c.v)
    if (value?.length>1000) invalid('A workbook cell is too long.')
    return { col:ref[1], value:value??'' }
  }).filter(c=>c.value!==''))
  return normalizeRows(rows, String(sourceName).replace(/[\x00-\x1f]/g,'').slice(0,160), crypto.createHash('sha256').update(buffer).digest('hex'))
}
module.exports={parseHans,normalizeRows,duration,MAX_FILE}
