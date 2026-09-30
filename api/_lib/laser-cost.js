const Decimal = require('decimal.js')
const D = Decimal.clone({ precision:32, rounding:Decimal.ROUND_HALF_UP })
function bad(message) { const e=new Error(message); e.status=400; throw e }
const numeric=['sheetPrice','pricePerKg','density','remnantCredit','machineHourly','setupMinutes','setupHourly','laborMinutes','laborHourly','otherCost','packPrice','bottles','volumePerBottle','usablePct','gasUnitPrice','gasFlowLmin','pierceFlowLmin','purgeSeconds','gasManualCost','powerKw','energyPrice','electricityManualCost','percentage','minimumCharge']
const choices={ method:['shop','hans'],materialMode:['sheet','kg','customer'],gasMode:['pack','unit','manual','included'],electricityMode:['estimate','manual','included'],pricing:['margin','markup'] }
function normalizeRates(input) {
  if (!input || typeof input!=='object' || Array.isArray(input)) bad('Enter costing settings.')
  const r={}
  for (const [key,allowed] of Object.entries(choices)) { if (!allowed.includes(input[key])) bad(`Choose ${key}.`); r[key]=input[key] }
  if (!['CAD','USD','EUR','GBP'].includes(input.currency)) bad('Choose a supported currency. Currency conversion is not automatic.')
  r.currency=input.currency
  for (const key of numeric) {
    const v=input[key]
    if (v==null || v==='') {r[key]=null;continue}
    if (!['string','number'].includes(typeof v) || !/^\d+(?:\.\d{1,8})?$/.test(String(v)) || !Number.isFinite(+v) || +v>1e8) bad(`Invalid ${key}; use a non-negative number with at most 8 decimal places.`)
    r[key]=new D(v).toString()
  }
  for (const key of ['gasReason','electricityReason']) { if (input[key]!=null && typeof input[key]!=='string') bad(`Invalid ${key}.`);r[key]=(input[key]||'').trim().slice(0,300) }
  if (r.usablePct!==null && (+r.usablePct<=0 || +r.usablePct>100)) bad('Usable gas must be greater than 0% and at most 100%.')
  if (r.bottles!==null && (!Number.isInteger(+r.bottles)||+r.bottles<1)) bad('Bottle count must be a positive whole number.')
  if (r.percentage!==null && (r.pricing==='margin'?+r.percentage>=100:+r.percentage>1000)) bad('Margin must be below 100%; markup must not exceed 1000%.')
  return r
}
function calculate(source, input) {
  const rates=normalizeRates(input), missing=[], warnings=[...(source.warnings||[])], components=[], usage={}
  const get=(key,label,positive=false)=>{if(rates[key]===null || (positive && +rates[key]===0)){missing.push(label);return null};return new D(rates[key])}
  const add=(name,value)=>{components.push({name,amount:value===null?null:value.toDecimalPlaces(2).toNumber()})}
  if (rates.method==='hans') {
    for (const [key,name] of [['material','Han’s material charge'],['cutting','Han’s cutting charge'],['piercing','Han’s piercing charge'],['travel','Han’s travel charge']]) add(name,new D(source.charges[key]))
    warnings.push('Han’s amounts are configured charges, not verified production costs. Confirm the selected currency and which expenses those charges already include.')
  } else {
    let material=null
    if (rates.materialMode==='customer') material=new D(0)
    if (rates.materialMode==='sheet') {const price=get('sheetPrice','Sheet price'); if(price)material=price.times(source.sheetCount)}
    if (rates.materialMode==='kg') {const price=get('pricePerKg','Material price per kg'),density=get('density','Material density in g/cm³',true);if(price&&density){const kg=new D(source.sheetWidthMm).times(source.sheetHeightMm).times(source.thicknessMm).times(density).div(1e6).times(source.sheetCount);usage.sheetKg=kg.toDecimalPlaces(6).toNumber();material=kg.times(price)}}
    const credit=get('remnantCredit','Remnant credit (enter 0 if none)')
    if (material&&credit) {if(credit.gt(material))bad('Remnant credit cannot exceed material cost.');material=material.minus(credit)}else material=null
    add('Material',material)
    const hourly=get('machineHourly','Machine hourly cost, excluding separately entered expenses')
    add('Machine processing',hourly?hourly.times(source.totalSeconds).div(3600):null)
    for(const [name,minutesKey,hourlyKey] of [['Setup','setupMinutes','setupHourly'],['Additional labor','laborMinutes','laborHourly']]){
      const minutes=get(minutesKey,name+' minutes (enter 0 if none)')
      const rate=minutes&&minutes.isZero()?new D(0):get(hourlyKey,name+' hourly cost')
      add(name,minutes&&rate?minutes.times(rate).div(60):null)
    }
  }
  let gas=null
  if(rates.gasMode==='included') {gas=new D(0);if(!rates.gasReason)missing.push('Reason gas is included elsewhere or excluded');warnings.push('Gas is included elsewhere or excluded: '+rates.gasReason)}
  else if(rates.gasMode==='manual') gas=get('gasManualCost','Manual gas charge')
  else {
    let unit=null
    if(rates.gasMode==='unit')unit=get('gasUnitPrice','Gas price per standard m³')
    else {
      const pack=get('packPrice','Bottle pack refill price'),bottles=get('bottles','Bottles per pack',true),volume=get('volumePerBottle','Standard m³ of gas per bottle',true),usable=get('usablePct','Usable gas percentage',true)
      if(pack&&bottles&&volume&&usable){const available=bottles.times(volume).times(usable).div(100);usage.packUsableM3=available.toDecimalPlaces(6).toNumber();unit=pack.div(available)}
    }
    const cut=get('gasFlowLmin','Cutting gas flow in standard L/min'),pierce=get('pierceFlowLmin','Piercing gas flow in standard L/min'),purge=get('purgeSeconds','Additional gas-on seconds (enter 0 if none)')
    if(unit&&cut&&pierce&&purge){const volume=cut.times(new D(source.cuttingSeconds).plus(purge)).plus(pierce.times(source.piercingSeconds)).div(60000);usage.gasM3=volume.toDecimalPlaces(6).toNumber();usage.gasPerM3=unit.toDecimalPlaces(6).toNumber();gas=volume.times(unit)}
  }
  add('Gas',gas)
  let electricity=null
  if(rates.electricityMode==='included'){electricity=new D(0);if(!rates.electricityReason)missing.push('Reason electricity is included elsewhere or excluded');warnings.push('Electricity is included elsewhere or excluded: '+rates.electricityReason)}
  else if(rates.electricityMode==='manual')electricity=get('electricityManualCost','Manual electricity charge')
  else {const kw=get('powerKw','Average electrical input kW'),tariff=get('energyPrice','Electricity price per kWh');if(kw&&tariff){const setup=rates.method==='shop'&&rates.setupMinutes!==null?new D(rates.setupMinutes).times(60):new D(0);const kwh=kw.times(new D(source.totalSeconds).plus(setup)).div(3600);usage.energyKwh=kwh.toDecimalPlaces(6).toNumber();electricity=kwh.times(tariff)}}
  add('Electricity',electricity)
  add('Other operations / overhead',get('otherCost','Other costs (enter 0 if none)'))
  const percentage=get('percentage','Margin or markup percentage'),minimum=get('minimumCharge','Minimum selling charge (enter 0 if none)')
  let basis=null,price=null,margin=null
  if(!missing.length&&components.every(c=>c.amount!==null)){
    const total=components.reduce((sum,c)=>sum.plus(c.amount),new D(0))
    const raw=rates.pricing==='margin'?total.div(new D(1).minus(percentage.div(100))):total.times(new D(1).plus(percentage.div(100)))
    const sell=D.max(raw,minimum).toDecimalPlaces(2)
    basis=total.toNumber();price=sell.toNumber();margin=sell.isZero()?null:sell.minus(total).div(sell).times(100).toDecimalPlaces(2).toNumber()
    if(sell.gt(1e9))bad('Quote exceeds the supported amount.')
  }
  return {version:1,rates,components,usage,missing:[...new Set(missing)],warnings,complete:missing.length===0,basis,price,margin,currency:rates.currency,quantity:source.parts.reduce((n,p)=>n+p.nested,0)}
}
module.exports={calculate,normalizeRates}
