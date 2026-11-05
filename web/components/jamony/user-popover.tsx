"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, ArrowRight, Flag, ImagePlus } from "lucide-react"
import { FilterSelect } from "@/components/jamony/filter-select"
import { useRouter } from "next/navigation"
import { FollowButton } from "@/components/jamony/follow-button"
import { Avatar } from "@/components/jamony/avatar"
import { useDM } from "@/lib/dm-context"
import { useAuth } from "@/lib/auth-context"
import { displayShort, splitRegion } from "@/lib/regions"

// 10-23 欢哥定稿：遮罩点外关闭须「按下+松开都在遮罩」——click 派发到公共祖先，单判 target 会被拖出松开误关
const downOnOverlay = { current: false }

type PopoverUser = {
  id: number
  nickname: string
  primary_instrument: string
  instrument_category: string
  secondary_instrument?: string
  city: string
  signature?: string
  gender?: string | null // 1105: by-nickname 仅 male/female 外显, secret/未填=null
  level: number
  points: number
  created_at: string
  works_count?: number
  total_likes?: number
  is_following?: boolean
  avatar_url?: string
}

type PopoverPos = { top: number; left: number } | null

// 1105欢哥定稿: 卡片地区短显——国内「广东省 深圳市」→「广东·深圳」(直辖市→「北京」);海外原样完整串(装逼选海外的就让他超长截断)
const regionDisplay = (city: string) => {
  if (!city) return ""
  const parts = splitRegion(city)
  if (!parts || parts[0] === "海外") return city
  return parts.filter(Boolean).map(displayShort).join("·")
}

export function UserPopover({
  nickname,
  children,
}: {
  nickname: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [pos, setPos] = useState<PopoverPos>(null)
  const [user, setUser] = useState<PopoverUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [imgOpen, setImgOpen] = useState(false)
  const { openConversation } = useDM()
  const { user: me } = useAuth()
  const popRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const nameRef = useRef<HTMLSpanElement>(null)
  const [nameClamped, setNameClamped] = useState(false)
  const instrRef = useRef<HTMLSpanElement>(null)
  const [instrClamped, setInstrClamped] = useState(false)
  // 举报(1105欢哥令: 用户卡举报入口; 三分类+可选证据图; 一人一目标一票)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState("")
  const [reportCustom, setReportCustom] = useState("")
  const [reportFile, setReportFile] = useState<File | null>(null)
  const [reportPreview, setReportPreview] = useState("")
  const [reportBusy, setReportBusy] = useState(false)
  const [reportDone, setReportDone] = useState(false)
  const [reportError, setReportError] = useState("")

  const resetReport = () => {
    setReportReason(""); setReportCustom(""); setReportFile(null)
    if (reportPreview) URL.revokeObjectURL(reportPreview)
    setReportPreview(""); setReportDone(false); setReportError("")
  }

  const submitReport = async () => {
    if (!user || reportBusy) return
    setReportBusy(true); setReportError("")
    try {
      const fd = new FormData()
      fd.append("reason", reportReason === "其他" ? reportCustom.trim() : reportReason)
      if (reportFile) fd.append("evidence", reportFile)
      const res = await fetch(`/api/users/${user.id}/report`, { method: "POST", body: fd, credentials: "include" })
      const data = await res.json()
      if (data.ok) { setReportDone(true); setTimeout(() => { setReportOpen(false); resetReport() }, 2000) }
      else setReportError(data.msg || "提交失败，请重试")
    } catch {
      setReportError("网络异常，请重试")
    }
    setReportBusy(false)
  }

  // 1105欢哥定稿: 截断时悬停出全文(jamony-tip 统一悬停体系, 对标 jamsoul QToolTip)
  useEffect(() => {
    const name = nameRef.current
    if (name) setNameClamped(name.scrollWidth > name.clientWidth)
    const instr = instrRef.current
    if (instr) setInstrClamped(instr.scrollWidth > instr.clientWidth)
  }, [user])

  const close = () => { setPos(null); setImgOpen(false) }

  useEffect(() => {
    if (!pos) return
    function onClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        close()
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [pos])

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation() // 1105修: trigger 嵌在整卡<button>内时(公告卡/作品卡)防连开两层
    if (pos) { close(); return }
    // position relative to the trigger element
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    // 卡片 w-72(288px): 左缘钳制防屏幕右溢
    setPos({ top: rect.bottom + 6, left: Math.min(Math.max(10, rect.left - 60), window.innerWidth - 298) })

    if (!user) {
      setLoading(true)
      try {
        const res = await fetch(`/api/users/by-nickname/${encodeURIComponent(nickname)}`)
        const data = await res.json()
        if (data.ok) setUser(data.user)
      } catch {}
      setLoading(false)
    }
  }

  const instrumentIcon: Record<string, string> = {
    "原声吉他": "🎸", "电吉他": "🎸", "贝斯": "🎸",
    "打击乐器": "🥁", "键盘乐器": "🎹", "主唱": "🎤",
    "弦乐": "🎻", "管乐": "🎷", "民乐": "🪕", "其他": "🎵", "听众": "🎧",
  }

  const cat = user?.instrument_category || ""
  const icon = instrumentIcon[cat] || "🎵"

  // 1105修: 匿名乐手/空昵称无真身可查(by-nickname 404→假"加载失败"), 不包交互直接渲染
  const isAnonymous = !nickname || nickname === "匿名乐手"
  if (isAnonymous) return <>{children}</>

  return (
    <>
      <span ref={triggerRef} onClick={handleClick} className="inline cursor-pointer hover:opacity-80 transition-opacity">
        {children}
      </span>

      {pos && (
        <div
          ref={popRef}
          className="fixed z-[80] w-72 rounded-[14px] border shadow-2xl"
          style={{ top: pos.top, left: pos.left, background: "#0D0D0D", borderColor: "#1A1A1A" }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-10"><span className="text-xs" style={{ color: "#8A8A8A" }}>加载中...</span></div>
          ) : user ? (
            <>
              {/* 顶部个人信息 */}
              <div className="flex items-start gap-3 p-4 pb-2">
                <button
                  onClick={() => setImgOpen(true)}
                  className="shrink-0 transition-transform hover:scale-105"
                >
                  <Avatar nickname={user.nickname} avatarUrl={user.avatar_url} size={52} />
                </button>
                <div className="min-w-0 flex-1">
                  {/* 1105欢哥定稿: 性别符号永远占位(男/女显符号,保密/未选=空占位),紧跟昵称结尾;长昵称截断时不被顶出 */}
                  <p className="jamony-tip-host flex items-center gap-1 text-[15px] font-bold text-white">
                    <span ref={nameRef} className="min-w-0 truncate">{user.nickname}</span>
                    <span
                      className="w-4 shrink-0 text-center text-[14px]"
                      style={{ color: user.gender === "male" ? "#00AAFF" : user.gender === "female" ? "#FF33AA" : undefined }}
                    >
                      {user.gender === "male" ? "♂" : user.gender === "female" ? "♀" : ""}
                    </span>
                    {nameClamped && <span className="jamony-tip left-0 top-full mt-1.5">{user.nickname}</span>}
                  </p>
                  {/* 乐器·地区: 原位单行截断(1105欢哥: 右端=签名右端,截断带…),截断悬停全文 */}
                  <p className="jamony-tip-host mt-0.5 flex items-center gap-1 text-[12px]" style={{ color: "#B0B0B0" }}>
                    <span className="shrink-0">{icon}</span>
                    <span ref={instrRef} className="min-w-0 truncate">{user.primary_instrument}{user.city ? ` · ${regionDisplay(user.city)}` : ""}</span>
                    {instrClamped && (
                      <span className="jamony-tip left-0 top-full mt-1.5">
                        {icon} {user.primary_instrument}{user.city ? ` · ${user.city}` : ""}
                      </span>
                    )}
                  </p>
                  {/* 1105欢哥定稿: 等级/积分退役(库与API字段保留,未来引擎直接用),换成陪伴天数+身份标签一行;公式与文案对齐 profile-page 1025 定稿 */}
                  <p className="mt-0.5 flex items-center gap-1.5 text-[12px]" style={{ color: "#8A8A8A" }}>
                    已来到 jamony {Math.max(1, Math.ceil((Date.now() - new Date(user.created_at).getTime()) / 86400000))} 天
                    <span className="ml-auto rounded-md px-1.5 py-0.5 text-[10px]" style={{ color: "#FF33AA", backgroundColor: "rgba(255,51,170,0.10)" }}>
                      免费用户
                    </span>
                  </p>
                </div>
              </div>

              {/* 签名:整宽两行截断(1105欢哥: 不斜体、无引号) */}
              {user.signature && (
                <p className="line-clamp-2 px-4 pb-2 text-[12px] leading-relaxed" style={{ color: "#8A8A8A" }}>
                  {user.signature}
                </p>
              )}

              {/* 作品·获赞(1105欢哥定稿: 数字后置; 0也显示=透明; 1106改"参与作品"=work_authors口径更严谨) */}
              <p className="px-4 pb-2.5 text-[12px] tabular-nums" style={{ color: "#8A8A8A" }}>
                参与作品{user.works_count ?? 0} · 获赞{user.total_likes ?? 0}
              </p>

              {/* 操作排:一排三小按钮(关注=FollowButton小pill,私信/主页=描边ghost) */}
              <div className="flex items-center gap-2 border-t px-4 py-2.5" style={{ borderColor: "#1A1A1A" }}>
                <FollowButton targetUserId={user.id} initialIsFollowing={!!user.is_following} size="small" />
                {me?.id !== user.id && (
                  <button
                    onClick={() => { close(); openConversation(user.id) }} // 1106欢哥令: 点私信先关用户卡,抽屉独占前台
                    className="rounded-full border px-3 py-1 text-[11px] font-medium transition-colors hover:border-[#4A4A4A] hover:text-white"
                    style={{ borderColor: "#2A2A2A", color: "#C9C9C9" }}
                  >
                    私信
                  </button>
                )}
                <button
                  onClick={() => router.push(`/profile?nickname=${encodeURIComponent(user.nickname)}`)}
                  className="flex items-center gap-0.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors hover:border-[#4A4A4A] hover:text-white"
                  style={{ borderColor: "#2A2A2A", color: "#C9C9C9" }}
                >
                  个人主页
                  <ArrowRight className="h-3 w-3" />
                </button>
                {me?.id !== user.id && (
                  <button
                    type="button"
                    onClick={() => { setReportOpen(true); resetReport() }}
                    className="jamony-tip-host ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors hover:border-[#FF5C5C]/50 hover:text-[#FF5C5C]"
                    style={{ borderColor: "#2A2A2A", color: "#8A8A8A" }}
                  >
                    <Flag className="h-3 w-3" />
                    <span className="jamony-tip right-0 top-full mt-1.5">举报该用户</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="px-4 py-6 text-center text-xs" style={{ color: "#8A8A8A" }}>用户信息加载失败</div>
          )}
        </div>
      )}

      {/* 头像放大 */}
      {imgOpen && user && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onMouseDown={(e) => { downOnOverlay.current = e.target === e.currentTarget }} onClick={(e) => { if (e.target === e.currentTarget && downOnOverlay.current) setImgOpen(false) }}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <Avatar nickname={user.nickname} avatarUrl={user.avatar_url} size={120} className="shadow-2xl" />
          </div>
        </div>
      )}

      {/* 举报弹窗(1105欢哥令: 三分类+其他必填描述+可选证据图; 样式照 comment-section 举报弹窗) */}
      {reportOpen && user && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onMouseDown={(e) => { downOnOverlay.current = e.target === e.currentTarget }}
          onClick={(e) => { if (e.target === e.currentTarget && downOnOverlay.current) { setReportOpen(false); resetReport() } }}
        >
          <div className="w-full max-w-sm rounded-2xl border p-5" style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }} onClick={(e) => e.stopPropagation()}>
            {reportDone ? (
              <div className="py-4 text-center">
                <p className="text-sm text-white">✓ 已收到你的举报</p>
                <p className="mt-1 text-xs" style={{ color: "#8A8A8A" }}>我们会尽快核实处理</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-white">举报 <span className="font-semibold">{user.nickname}</span></p>
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px]" style={{ color: "#FF5C5C" }}>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  无故举报他人属于严重违规行为，请谨慎举报。
                </p>
                <div className="mt-3">
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: "#8A8A8A" }}>
                    <span style={{ color: "#FF5C5C" }}>* </span>举报类型
                  </label>
                  <FilterSelect variant="field" label="选择举报类型" value={reportReason} onChange={setReportReason}
                    options={["个人信息违规", "扰乱房间内秩序", "其他"].map((r) => ({ value: r, label: r }))} />
                </div>
                {reportReason === "其他" && (
                  <textarea
                    value={reportCustom}
                    onChange={(e) => setReportCustom(e.target.value)}
                    placeholder="说明原因…（300字以内）"
                    rows={2}
                    maxLength={300}
                    className="mt-2 w-full resize-none rounded-lg border border-[#1A1A1A] bg-black px-3 py-2 text-xs text-white outline-none focus:border-[#00AAFF]"
                  />
                )}
                {/* 证据图(可选单图) */}
                <div className="mt-3">
                  {reportFile ? (
                    <div className="relative inline-block">
                      <img src={reportPreview} alt="证据" className="h-14 w-14 rounded-lg border border-[#1A1A1A] object-cover" />
                      <button
                        type="button"
                        onClick={() => { URL.revokeObjectURL(reportPreview); setReportFile(null); setReportPreview("") }}
                        className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white"
                        style={{ background: "#FF33AA" }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <label className="flex h-14 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[#2A2A2A] px-3 text-xs transition-colors hover:border-[#4A4A4A]" style={{ color: "#8A8A8A" }}>
                      <ImagePlus className="h-3.5 w-3.5" />
                      上传证据图（可选）
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0] || null; setReportFile(f); setReportPreview(f ? URL.createObjectURL(f) : "") }} />
                    </label>
                  )}
                </div>
                {reportError && <p className="mt-2 text-xs" style={{ color: "#FF5C5C" }}>{reportError}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => { setReportOpen(false); resetReport() }} className="px-4 py-1.5 text-xs text-[#9A9A9A] transition-colors hover:text-white">取消</button>
                  <button
                    type="button"
                    disabled={reportBusy || !reportReason || (reportReason === "其他" && !reportCustom.trim())}
                    onClick={submitReport}
                    className="rounded-full px-4 py-1.5 text-xs font-medium text-white disabled:opacity-30"
                    style={{ background: "linear-gradient(135deg, #FF33AA, #9933FF)" }}
                  >
                    {reportBusy ? "提交中…" : "提交举报"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
