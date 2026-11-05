"use client"

// 地区两级选择器(1105 城市→地区改造, 欢哥四级拍板) — 设置页 + 发公告共用一套
// 数据单一源: web/lib/regions.ts ← api/lib/regions-data.json(35一级/712二级)
// 受控组件: 父持有 l1/l2 state, 保存处校验「一级有二级时必须选到二级」
// 1105 欢哥定稿: 直辖市到市为止(无二级, 一级即完成); onChange 完整串由父拼
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
  const l2Label = !l1 ? "请先选省/地区" : l1 === "海外" ? "国家/地区" : l1.startsWith("中国") ? "区/县市" : "市/州"

  const pickL1 = (v: string) => {
    onL1(v)
    onL2("") // 切一级清二级
  }

  const applyGuess = () => {
    if (!guess) return
    onL1(guess.l1)
    onL2(guess.l2 || "") // 无二级值时留空: 直辖市=一级即完成, 台湾待补选县市
  }

  return (
    <div>
      <div className={l2Options.length > 0 ? "grid grid-cols-2 gap-3" : ""}>
        <FilterSelect variant="field" label={l1 || "省/地区"} value={l1} onChange={pickL1} options={L1_OPTIONS} />
        {l2Options.length > 0 && (
          <FilterSelect variant="field" label={l2Label} value={l2} onChange={onL2} options={l2Options} />
        )}
      </div>
      {guess && guess.l1 && !l1 && (
        <button type="button" onClick={applyGuess}
          className="mt-2 flex w-full items-center gap-1.5 rounded-[10px] border border-[#2A2A2A] bg-[#141414] px-3 py-1.5 text-xs transition-colors hover:border-[#3A3A3A]"
          style={{ color: "#B3B3B3" }}>
          <MapPin size={13} style={{ color: "#009DFF" }} />
          <span>猜你所在：{displayShort(guess.l1)}{guess.l2 ? ` · ${displayShort(guess.l2)}` : getRegionChildren(guess.l1).length === 0 ? "" : " · 待补选区"}</span>
          <span className="ml-auto" style={{ color: "#009DFF" }}>使用</span>
        </button>
      )}
    </div>
  )
}
