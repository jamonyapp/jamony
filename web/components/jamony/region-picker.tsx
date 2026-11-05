"use client"

// 地区两级选择器(1105 城市→地区改造, 欢哥四级拍板) — 设置页 + 发公告共用一套
// 数据单一源: web/lib/regions.ts ← api/lib/regions-data.json(35一级/712二级)
// 受控组件: 父持有 l1/l2 state, 保存处校验「一级选了二级必须选」(海外一级即完成除外)
// onChange 完整串由父拼: l1 && l2 ? `${l1} ${l2}` : ""
import { MapPin } from "lucide-react"
import { FilterSelect } from "@/components/jamony/filter-select"
import { REGION_L1, getRegionChildren, displayShort } from "@/lib/regions"

const L1_OPTIONS = [{ value: "", label: "未设置" }, ...REGION_L1.map((n) => ({ value: n, label: n }))]

export function RegionPicker({
  l1,
  l2,
  onL1,
  onL2,
  guess, // IP 猜测(GET /api/ip-location; 仅设置页传; 一级已选时不打扰)
}: {
  l1: string
  l2: string
  onL1: (v: string) => void
  onL2: (v: string) => void
  guess?: { l1: string; l2: string | null } | null
}) {
  const l2Options = l1 ? getRegionChildren(l1).map((c) => ({ value: c, label: c })) : []
  const l2Label = !l1 ? "请先选省/地区" : l1 === "海外" ? "国家/地区" : l1.endsWith("市") || l1.startsWith("中国") ? "区/县市" : "市/州"

  const pickL1 = (v: string) => {
    onL1(v)
    onL2("") // 切一级清二级
  }

  const applyGuess = () => {
    if (!guess) return
    onL1(guess.l1)
    onL2(guess.l2 || "") // 直辖市/台湾: IP 只到一级, 二级待用户补选(显示「待补选区」)
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <FilterSelect variant="field" label={l1 || "省/地区"} value={l1} onChange={pickL1} options={L1_OPTIONS} />
        <FilterSelect variant="field" label={l2Label} value={l2} onChange={onL2} options={l2Options} disabled={!l1} />
      </div>
      {guess && guess.l1 && !l1 && (
        <button type="button" onClick={applyGuess}
          className="mt-2 flex w-full items-center gap-1.5 rounded-[10px] border border-[#2A2A2A] bg-[#141414] px-3 py-1.5 text-xs transition-colors hover:border-[#3A3A3A]"
          style={{ color: "#B3B3B3" }}>
          <MapPin size={13} style={{ color: "#009DFF" }} />
          <span>猜你所在：{displayShort(guess.l1)}{guess.l2 ? ` · ${displayShort(guess.l2)}` : " · 待补选区"}</span>
          <span className="ml-auto" style={{ color: "#009DFF" }}>使用</span>
        </button>
      )}
    </div>
  )
}
