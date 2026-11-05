// 地区数据(1105 城市→地区改造) — 源头: ../api/lib/regions-data.json(api 端白名单 require 本体)
// 本文件 import 的是构建时分发的副本(prebuild copy-regions.mjs 复制, Next 不解析目录外 import)
// 改数据改 api 那份, web 构建自动随迁; 副本已 gitignore
import regionsData from "./regions-data.json"

export interface RegionLevel {
  name: string
  children: string[]
}

export const REGIONS: RegionLevel[] = (regionsData as { levels: RegionLevel[] }).levels

// 一级选项(直辖市→省·自治区拼音序→港澳台→海外)
export const REGION_L1 = REGIONS.map((l) => l.name)

// 二级联动: 选一级后取二级列表
export function getRegionChildren(l1: string): string[] {
  return REGIONS.find((l) => l.name === l1)?.children ?? []
}

// 完整串拆解: 「广东省 深圳市」→[一级,二级]; 直辖市单值「北京市」→[北京市,""](1105 定稿); 旧格式(「北京」「线上」)→null 置空重选
export function splitRegion(value: string): [string, string] | null {
  if (!value) return null
  const i = value.indexOf(" ")
  if (i < 0) {
    return REGION_L1.includes(value) && getRegionChildren(value).length === 0 ? [value, ""] : null
  }
  return [value.slice(0, i), value.slice(i + 1)]
}

// 短名显示(「猜你所在」条友好文案): 广东省→广东 / 北京市→北京 / 内蒙古自治区→内蒙古 / 中国香港→香港
export function displayShort(name: string): string {
  return name
    .replace(/(壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市)$/, "")
    .replace(/^中国/, "")
}

// 是否选完整(保存闸): 空=未设置合法; 直辖市无二级一级即完成(1105 欢哥定稿); 其余必须到二级
export function isRegionComplete(l1: string, l2: string): boolean {
  if (!l1) return true
  return getRegionChildren(l1).length > 0 ? !!l2 : true
}

// 拼存储串: 完整时「一级 二级」或直辖市单值「北京市」; 未完成返回空串
export function joinRegion(l1: string, l2: string): string {
  if (!isRegionComplete(l1, l2)) return ""
  if (!l1) return ""
  return getRegionChildren(l1).length > 0 ? `${l1} ${l2}` : l1
}
