"use client"

import { useEffect, useState } from "react"

// 1104批次2步骤三(+补·隐私政策并轨): 协议/政策文档独立页公共组件——/terms 与 /privacy 共用
// 正文单一来源=DB(admin 发布新版本后自动跟进); middleware 对外豁免
const plainText = (md: string) => md.replace(/^#{1,6}\s*/gm, "").replace(/\*\*/g, "")

type Doc = { version: string; effectiveDate: string; content: string }

export function AgreementDocPage({ kind }: { kind: "user" | "privacy" }) {
  const [docs, setDocs] = useState<{ userAgreement: Doc | null; privacy: Doc | null } | null>(null)
  const [err, setErr] = useState("")

  useEffect(() => {
    fetch("/api/agreements")
      .then((r) => r.json())
      .then((d) => (d.ok ? setDocs({ userAgreement: d.userAgreement, privacy: d.privacy }) : setErr("加载失败")))
      .catch(() => setErr("网络错误"))
  }, [])

  const doc = kind === "user" ? docs?.userAgreement : docs?.privacy
  const title = kind === "user" ? "jamony用户协议" : "jamony隐私政策"

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-4 py-10 pb-28">
        <h1 className="mb-2 text-xl font-bold text-white">{title}</h1>
        {doc && (
          <p className="mb-6 text-xs" style={{ color: "#6A6A6A" }}>
            版本 {doc.version} · 生效日期 {doc.effectiveDate}
          </p>
        )}
        <div className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "#B0B0B0" }}>
          {err ? err : doc ? plainText(doc.content) : "加载中..."}
        </div>
        <p className="mt-10 text-center text-xs" style={{ color: "#6A6A6A" }}>
          {kind === "user" ? (
            <>另见 <a href="/privacy" style={{ color: "#00AAFF" }}>《jamony隐私政策》</a></>
          ) : (
            <>另见 <a href="/terms" style={{ color: "#00AAFF" }}>《jamony用户协议》</a></>
          )}
        </p>
      </div>
    </div>
  )
}
