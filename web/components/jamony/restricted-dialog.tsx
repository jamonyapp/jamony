"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { X } from "lucide-react"
import { AppealForm } from "@/components/jamony/appeal-form"

// 1023 七件套②: 403 code:'RESTRICTED' → 受限专用 Dialog（文案 + 申诉入口，非通用错误弹窗）
// 发布五入口（发/编公告、作品发表、双区评论、建房）错误分支特判后调 openRestricted(data.msg)
// 文案本体来自 api guardCanPublish（欢哥定稿 403 文案，单一事实源），此处只负责呈现

// 10-23 欢哥定稿：遮罩点外关闭须「按下+松开都在遮罩」——click 派发到公共祖先，单判 target 会被拖出松开误关
const downOnOverlay = { current: false }

const RestrictedCtx = createContext<{ openRestricted: (msg: string) => void } | null>(null)

export function useRestrictedDialog() {
  const ctx = useContext(RestrictedCtx)
  if (!ctx) throw new Error("useRestrictedDialog 必须在 RestrictedProvider 内使用")
  return ctx
}

export function RestrictedProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const openRestricted = useCallback((m: string) => setMsg(m || "因发布违规内容，您的部分功能已被限制。请您注意在jamony的行为规范。"), [])

  // Esc 关闭（查看型弹窗，允许 Esc）
  useEffect(() => {
    if (msg === null) return
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setMsg(null) }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [msg])

  return (
    <RestrictedCtx.Provider value={{ openRestricted }}>
      {children}
      {msg !== null && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60"
          onMouseDown={(e) => { downOnOverlay.current = e.target === e.currentTarget }}
          onClick={(e) => { if (e.target === e.currentTarget && downOnOverlay.current) setMsg(null) }}
        >
          <div className="w-[440px] max-w-[90vw] rounded-[10px] border p-5" style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}>
            <div className="flex items-start justify-between">
              <p className="text-[15px] font-semibold text-white">发布受限</p>
              <button onClick={() => setMsg(null)} aria-label="关闭" className="text-[#8A8A8A] transition-colors hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "#C8C8C8" }}>{msg}</p>
            <div className="mt-4 border-t pt-4" style={{ borderColor: "#1A1A1A" }}>
              <p className="mb-3 text-xs leading-relaxed" style={{ color: "#8A8A8A" }}>
                如果您认为这是误判，可以提交申诉。处理结果将通过站内信通知您，也可在「个人主页 - 申诉」查看进度。
              </p>
              <AppealForm />
            </div>
          </div>
        </div>
      )}
    </RestrictedCtx.Provider>
  )
}
