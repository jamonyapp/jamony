/**
 * jamony 地区白名单校验 —— 1105 城市→地区改造(欢哥拍板: 上白名单堵死直打塞垃圾)
 * 数据本体: ./regions-data.json (35一级/712二级/246国; 四级拍板: 两级结构+34省级行政区全称+港澳台+海外拼音序)
 * 单一数据源: web/lib/regions.ts 构建时内联同一份 JSON —— 改数据只改 json 一处
 * 语义: 空=未设置(合法, 落NULL); 非空必须精确命中「一级 二级」完整串(如「广东省 深圳市」「海外 美国」)
 */
const data = require('./regions-data.json')

// children 为空的一级(1105 欢哥定稿: 直辖市到市为止不选区县)=单值合法「北京市」
const VALID = new Set()
const CHILDREN = new Map() // 一级名 → Set(二级)(直辖市为空集=一级即完成)
for (const level of data.levels) {
  CHILDREN.set(level.name, new Set(level.children))
  if (level.children.length === 0) VALID.add(level.name)
  for (const child of level.children) VALID.add(`${level.name} ${child}`)
}

function isValidRegion(value) {
  if (value === '' || value === null || value === undefined) return true
  return VALID.has(String(value))
}

// —— IP 定位(1105 「猜你所在」): ip2region v2.3.0 内嵌 xdb(11MB 随 npm install, 零外部文件) ——
// 实测格式: 普通省带全称「广东省/深圳市」直接命中; 直辖市 province=短名「北京」且 city=「北京市」(非区, 猜不出区);
// 海外 country=中文国名「美国」精确匹配海外二级
let ip2region = null
try {
  const { default: IP2Region } = require('ip2region')
  ip2region = new IP2Region()
} catch (e) {
  console.warn('[regions] ip2region 未安装, IP 猜测不可用:', e.message)
}

// 短名→一级映射(ip2region 直辖市/港澳台返回短名)
const L1_INDEX = new Map()
for (const level of data.levels) {
  L1_INDEX.set(level.name, level)
  const short = level.name.replace(/(壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市)$/, '')
  if (short && short !== level.name) L1_INDEX.set(short, level)
}
L1_INDEX.set('香港', L1_INDEX.get('中国香港'))
L1_INDEX.set('澳门', L1_INDEX.get('中国澳门'))
L1_INDEX.set('台湾', L1_INDEX.get('中国台湾'))

function isPrivateIp(ip) {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return true // 非 IPv4(::1/内网v6等)不猜
  return ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('127.') ||
    ip.startsWith('169.254.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
}

// 返回 { available:false } 或 { available:true, l1, l2 }——l2=null 表示该一级下猜不到二级(直辖市待补选区/台湾待选县市)
function lookupByIp(ip) {
  if (!ip2region || !ip || isPrivateIp(ip)) return { available: false }
  let r = null
  try { r = ip2region.search(ip) } catch (e) { return { available: false } }
  if (!r) return { available: false }
  if (r.country === '中国') {
    const level = L1_INDEX.get(r.province)
    if (!level) return { available: false }
    const child = level.children.includes(r.city) ? r.city : null
    return { available: true, l1: level.name, l2: child }
  }
  const overseas = L1_INDEX.get('海外')
  if (overseas && overseas.children.includes(r.country)) {
    return { available: true, l1: '海外', l2: r.country }
  }
  return { available: false }
}

module.exports = { data, isValidRegion, VALID, lookupByIp }
