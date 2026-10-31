"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

// 10-23 欢哥定稿：遮罩点外关闭须「按下+松开都在遮罩」——click 派发到公共祖先，单判 target 会被拖出松开误关
const downOnOverlay = { current: false }

// jamony 品牌制式对话框（1018 欢哥拍板：替掉全部原生 confirm/alert——系统弹窗圆角突兀不符品牌）
// 制式：rounded-[10px] + 深色卡 + 品牌渐变确认键（删除类红色 danger）；Promise 化，调用处 await 即可
// 用法：const dialog = useJamonyDialog(); if (!(await dialog.confirm("删吗？", { danger: true }))) return

type DialogOptions = { title?: string; danger?: boolean; confirmText?: string; cancelText?: string }
type DialogRequest = { message: string; options?: DialogOptions; mode: "confirm" | "alert"; resolve: (v: boolean) => void }

const DialogCtx = createContext<{ confirm: (message: string, options?: DialogOptions) => Promise<boolean>; alert: (message: string, options?: DialogOptions) => Promise<void> } | null>(null)

export function useJamonyDialog() {
  const ctx = useContext(DialogCtx)
  if (!ctx) throw new Error("useJamonyDialog 必须在 DialogProvider 内使用")
  return ctx
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<DialogRequest | null>(null)

  const confirm = useCallback((message: string, options?: DialogOptions) =>
    new Promise<boolean>((resolve) => setReq({ message, options, mode: "confirm", resolve })), [])
  const alert = useCallback((message: string, options?: DialogOptions) =>
    new Promise<void>((resolve) => setReq({ message, options, mode: "alert", resolve: () => resolve() })), [])

  const close = (v: boolean) => { req?.resolve(v); setReq(null) }

  // Esc = 取消（仅 confirm；alert 须明确知晓）
  useEffect(() => {
    if (!req) return
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && req.mode === "confirm") close(false) }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [req])

  return (
    <DialogCtx.Provider value={{ confirm, alert }}>
      {children}
      {req && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60" onMouseDown={(e) => { downOnOverlay.current = e.target === e.currentTarget }} onClick={(e) => { if (e.target === e.currentTarget && downOnOverlay.current) req.mode === "confirm" && close(false) }}>
          <div className="w-[360px] max-w-[90vw] rounded-[10px] border p-5" style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }} onClick={(e) => e.stopPropagation()}>
            <p className="text-[15px] font-semibold text-white">{req.options?.title || (req.mode === "confirm" ? "确认操作" : "提示")}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "#C8C8C8" }}>{req.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              {req.mode === "confirm" && (
                <button onClick={() => close(false)} className="rounded-[10px] border border-[#2A2A2A] px-4 py-1.5 text-sm transition-colors hover:bg-white/5" style={{ color: "#B0B0B0" }}>{req.options?.cancelText || "取消"}</button>
              )}
              <button onClick={() => close(true)} className="rounded-[10px] px-4 py-1.5 text-sm font-medium text-white transition-all active:scale-[0.97]"
                style={{ background: req.options?.danger ? "#FF5C5C" : "linear-gradient(135deg, #00AAFF, #9933FF)" }}>
                {req.mode === "alert" ? "知道了" : (req.options?.confirmText || "确认")}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogCtx.Provider>
  )
}
