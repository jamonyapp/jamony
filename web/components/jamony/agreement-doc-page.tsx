"use client"

import { useEffect, useState } from "react"

// 1104批次2步骤三(+补·隐私政策并轨): 协议/政策文档独立页公共组件——/terms 与 /privacy 共用
// 正文单一来源=DB(admin 发布新版本后自动跟进); middleware 对外豁免
const plainText = (md: string) => md.replace(/^#{1,6}\s*/gm, "").replace(/\*\*/g, "")

// 1128(欢哥): 文档内标题抽取——首个非空行是markdown标题时单独渲染(居中/加大/加粗), 余下正文照旧
function splitDocTitle(md: string): { title: string; body: string } {
  const lines = md.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t) continue
    if (/^#{1,6}\s+/.test(t)) {
      return { title: plainText(t), body: plainText(lines.slice(i + 1).join("\n").replace(/^\n+/, "")) }
    }
    return { title: "", body: plainText(md) }
  }
  return { title: "", body: plainText(md) }
}

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
  const split = doc ? splitDocTitle(doc.content) : null

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-4 py-10 pb-28">
        <h1 className="mb-2 text-center text-xl font-bold text-white">
          《{title}》{doc ? `（版本：v${doc.version}）` : ""}
        </h1>
        {doc && (
          <p className="mb-6 text-center text-xs" style={{ color: "#6A6A6A" }}>
            生效日期 {doc.effectiveDate}
          </p>
        )}
        <div className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "#B0B0B0" }}>
          {err ? err : split ? (
            <>
              {split.title && <p className="mb-5 text-center text-lg font-bold text-white">{split.title}</p>}
              {split.body}
            </>
          ) : "加载中..."}
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
