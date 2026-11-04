"use client"

import { useEffect, useState } from "react"

// 1104批次2步骤三: 用户协议独立页——middleware 对外豁免(浏览器可看), 登录弹窗内嵌视图的对外锚点
// 正文单一来源=DB(admin 发布新版本后此处自动跟进, web 不需重新部署)
const plainText = (md: string) => md.replace(/^#{1,6}\s*/gm, "").replace(/\*\*/g, "")

export default function TermsPage() {
  const [data, setData] = useState<{ version: string; effectiveDate: string; content: string } | null>(null)
  const [err, setErr] = useState("")

  useEffect(() => {
    fetch("/api/agreement")
      .then((r) => r.json())
      .then((d) => (d.ok ? setData({ version: d.version, effectiveDate: d.effectiveDate, content: d.content }) : setErr("协议加载失败")))
      .catch(() => setErr("网络错误"))
  }, [])

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-4 py-10 pb-28">
        <h1 className="mb-2 text-xl font-bold text-white">jamony用户协议</h1>
        {data && (
          <p className="mb-6 text-xs" style={{ color: "#6A6A6A" }}>
            版本 {data.version} · 生效日期 {data.effectiveDate}
          </p>
        )}
        <div className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "#B0B0B0" }}>
          {err ? err : data ? plainText(data.content) : "加载中..."}
        </div>
      </div>
    </div>
  )
}
