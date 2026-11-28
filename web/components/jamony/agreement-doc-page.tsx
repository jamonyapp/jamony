"use client"

import { useEffect, useState } from "react"

// 1104批次2步骤三(+补·隐私政策并轨): 协议/政策文档独立页公共组件——/terms 与 /privacy 共用
// 正文单一来源=DB(admin 发布新版本后自动跟进); middleware 对外豁免
const plainText = (md: string) => md.replace(/^#{1,6}\s*/gm, "").replace(/\*\*/g, "")

// 1128(欢哥): 文档头抽取——①首个非空行markdown标题(居中/加大/加粗) ②紧随的「版本：…」元信息行(居中); 余下正文照旧
function splitDocTitle(md: string): { title: string; meta: string; body: string } {
  const lines = md.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t) continue
    if (/^#{1,6}\s+/.test(t)) {
      let meta = ""
      let rest = lines.slice(i + 1)
      for (let j = 0; j < rest.length; j++) {
        const n = rest[j].trim()
        if (!n) continue
        if (/^版本[:：]/.test(plainText(n))) {
          meta = plainText(n)
          rest = rest.slice(j + 1)
        }
        break
      }
      return { title: plainText(t), meta, body: plainText(rest.join("\n").replace(/^\n+/, "")) }
    }
    return { title: "", meta: "", body: plainText(md) }
  }
  return { title: "", meta: "", body: plainText(md) }
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
        <h1 className="mb-6 text-center text-xl font-bold text-white">
          《{title}》{doc ? `（版本：v${doc.version}）` : ""}
        </h1>
        <div className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "#B0B0B0" }}>
          {err ? err : split ? (
            <>
              {split.title && <p className="mb-2 text-center text-lg font-bold text-white">{split.title}</p>}
              {split.meta && <p className="mb-5 text-center">{split.meta}</p>}
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
