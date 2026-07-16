"use client"

import { useEffect, useRef, useState } from "react"
import { X, ImagePlus, Megaphone, Loader2 } from "lucide-react"
import {
  type Notice,
  type NoticeType,
  NOTICE_TYPES,
  NOTICE_TYPE_LABEL,
  NOTICE_TYPE_COLOR,
  BG_COUNT,
  NOTICE_CATEGORIES,
  CITIES,
  STYLE_OPTIONS,
} from "@/lib/jamony-data"
import { useAuth } from "@/lib/auth-context"
import { mapNotice } from "@/lib/notice-mappers"

const LEVEL_OPTIONS = ["不限", "新手", "进阶", "熟练", "老炮", "大神"]
const DURATION_OPTIONS = [1, 3, 7] as const

type PublishNoticeModalProps = {
  open: boolean
  onClose: () => void
  onPublished: (notice: Notice) => void
  initialNotice?: Notice | null  // 有值=编辑模式
}

export function PublishNoticeModal({ open, onClose, onPublished, initialNotice }: PublishNoticeModalProps) {
  const { user } = useAuth()
  const isEdit = !!initialNotice

  const [type, setType] = useState<NoticeType | null>(null)
  const [category, setCategory] = useState<string>("")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [city, setCity] = useState("")
  const [style, setStyle] = useState("")
  const [jamTime, setJamTime] = useState("")
  const [level, setLevel] = useState("不限")
  const [neededCount, setNeededCount] = useState("")
  const [durationDays, setDurationDays] = useState<number>(7)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageRemoved, setImageRemoved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 打开时：编辑模式预填，否则重置
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = "hidden"
    if (initialNotice) {
      setType(initialNotice.type)
      setCategory(initialNotice.category || "")
      setTitle(initialNotice.title)
      setBody(initialNotice.body)
      setCity(initialNotice.city === "其他" ? "" : initialNotice.city)
      setStyle(initialNotice.style === "未分类" ? "" : initialNotice.style)
      setJamTime(initialNotice.jamTime || "")
      setLevel(initialNotice.level || "不限")
      setNeededCount(initialNotice.neededCount ? String(initialNotice.neededCount) : "")
      setDurationDays(7)
      setImageFile(null)
      setImagePreview(initialNotice.imageUrl || null)
      setImageRemoved(false)
    } else {
      reset()
    }
    setError(null)
    return () => { document.body.style.overflow = "" }
  }, [open, initialNotice])

  if (!open) return null

  const reset = () => {
    setType(null); setCategory(""); setTitle(""); setBody(""); setCity(""); setStyle("")
    setJamTime(""); setLevel("不限"); setNeededCount(""); setDurationDays(7)
    setImageFile(null); setImagePreview(null); setImageRemoved(false); setError(null)
  }

  const handleClose = () => { reset(); onClose() }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setImageRemoved(false)
  }

  const removeImage = () => {
    setImageFile(null)
    setImagePreview(null)
    setImageRemoved(true)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleSubmit = async () => {
    if (!type) { setError("请选择公告类型"); return }
    if (!title.trim()) { setError("请填写标题"); return }
    if (!body.trim()) { setError("请填写正文"); return }
    if (type === "offline" && !category) { setError("请选择公告分类"); return }
    if (!user) { setError("请先登录"); return }

    setSubmitting(true)
    setError(null)
    try {
      // 1) 上传图片（若有新选）
      let imageUrl = isEdit ? (imageRemoved ? null : (initialNotice?.imageUrl || null)) : null
      if (imageFile) {
        const fd = new FormData()
        fd.append("image", imageFile, imageFile.name)
        const upRes = await fetch("/api/notices/upload-image", { method: "POST", body: fd, credentials: "include" })
        const upData = await upRes.json()
        if (!upData.ok) { setError(upData.msg || "图片上传失败"); setSubmitting(false); return }
        imageUrl = upData.imageUrl
      }

      // 2) POST 新建 / PATCH 编辑
      const payload: any = {
        type,
        title: title.trim(),
        body: body.trim(),
        city: city.trim() || "其他",
        style: style.trim() || "未分类",
        image_url: imageUrl,
      }
      if (type === "offline") payload.category = category
      if (type === "online") {
        payload.jam_time = jamTime.trim() || null
        payload.level = level
        payload.needed_count = neededCount ? parseInt(neededCount) : null
      }
      if (!isEdit) payload.duration_days = durationDays

      const url = isEdit ? `/api/notices/${initialNotice!.id}` : "/api/notices"
      const method = isEdit ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      })
      const data = await res.json()
      if (!data.ok) { setError(data.msg || "发布失败"); setSubmitting(false); return }

      onPublished(mapNotice(data.notice))
      reset()
      onClose()
    } catch {
      setError("网络错误")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={handleClose}
    >
      <div
        className="jamony-modal-enter w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border p-6"
        style={{ backgroundColor: "#0D0D0D", borderColor: "#1A1A1A" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Megaphone className="h-5 w-5" style={{ color: "#9933FF" }} />
            {isEdit ? "编辑公告" : "发布公告"}
          </h2>
          <button onClick={handleClose} className="rounded-md p-1 text-[#8A8A8A] transition-colors hover:bg-[#1A1A1A] hover:text-white" aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {/* 公告类型 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-white">公告类型 <span style={{ color: "#FF33AA" }}>*</span></label>
            <div className="grid grid-cols-2 gap-2">
              {NOTICE_TYPES.map((t) => {
                const active = type === t
                return (
                  <button
                    key={t} type="button" onClick={() => !isEdit && setType(t)} disabled={isEdit}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed"
                    style={{ borderColor: active ? NOTICE_TYPE_COLOR[t] : "#2A2A2A", backgroundColor: active ? `${NOTICE_TYPE_COLOR[t]}1A` : "transparent", color: active ? "#fff" : "#8A8A8A", opacity: isEdit && !active ? 0.4 : 1 }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NOTICE_TYPE_COLOR[t] }} />
                    {NOTICE_TYPE_LABEL[t]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 线下：分类菜单 */}
          {type === "offline" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-white">分类 <span style={{ color: "#FF33AA" }}>*</span></label>
              <div className="grid grid-cols-4 gap-2">
                {NOTICE_CATEGORIES.map((c) => {
                  const active = category === c
                  return (
                    <button key={c} type="button" onClick={() => setCategory(c)}
                      className="rounded-lg border px-2 py-2 text-xs transition-colors"
                      style={{ borderColor: active ? "#9933FF" : "#2A2A2A", backgroundColor: active ? "rgba(153,51,255,0.15)" : "transparent", color: active ? "#fff" : "#8A8A8A" }}
                    >{c}</button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 线上：模板字段 */}
          {type === "online" && (
            <div className="flex flex-col gap-3 rounded-lg border p-3" style={{ borderColor: "#2A2A2A", backgroundColor: "#141414" }}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: "#8A8A8A" }}>时间</label>
                  <input type="datetime-local" value={jamTime} onChange={(e) => setJamTime(e.target.value)}
                    className="jamony-input w-full rounded-lg border px-3 py-2 text-sm text-white outline-none"
                    style={{ backgroundColor: "#0D0D0D", borderColor: "#2A2A2A", colorScheme: "dark" }} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: "#8A8A8A" }}>房间人数</label>
                  <select value={neededCount} onChange={(e) => setNeededCount(e.target.value)}
                    className="jamony-input w-full rounded-lg border px-3 py-2 text-sm text-white outline-none"
                    style={{ backgroundColor: "#0D0D0D", borderColor: "#2A2A2A" }}>
                    <option value="">选择人数</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={String(n)}>{n} 人{n === 1 ? "（独奏）" : ""}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "#8A8A8A" }}>水平</label>
                <select value={level} onChange={(e) => setLevel(e.target.value)}
                  className="jamony-input w-full rounded-lg border px-3 py-2 text-sm text-white outline-none"
                  style={{ backgroundColor: "#0D0D0D", borderColor: "#2A2A2A" }}>
                  {LEVEL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* 标题 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-white">标题 <span style={{ color: "#FF33AA" }}>*</span></label>
            <input type="text" value={title} maxLength={50} onChange={(e) => setTitle(e.target.value)} placeholder="给你的公告起个名字"
              className="jamony-input w-full rounded-lg border px-3 py-2 text-sm text-white outline-none placeholder:text-[#5A5A5A]"
              style={{ backgroundColor: "#141414", borderColor: "#2A2A2A" }} />
          </div>

          {/* 正文 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-white">
              {type === "online" ? "简短说明" : "正文"} <span style={{ color: "#FF33AA" }}>*</span>
            </label>
            <textarea value={body} rows={4} onChange={(e) => setBody(e.target.value)}
              placeholder={type === "online" ? "简单说说想玩什么、氛围如何..." : "详细描述你的公告内容..."}
              className="jamony-input w-full resize-none rounded-lg border px-3 py-2 text-sm text-white outline-none placeholder:text-[#5A5A5A]"
              style={{ backgroundColor: "#141414", borderColor: "#2A2A2A" }} />
          </div>

          {/* 城市 + 风格 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-white">城市</label>
              <select value={city} onChange={(e) => setCity(e.target.value)}
                className="jamony-input w-full rounded-lg border px-3 py-2 text-sm text-white outline-none"
                style={{ backgroundColor: "#141414", borderColor: "#2A2A2A" }}>
                <option value="">选择城市</option>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-white">风格</label>
              <select value={style} onChange={(e) => setStyle(e.target.value)}
                className="jamony-input w-full rounded-lg border px-3 py-2 text-sm text-white outline-none"
                style={{ backgroundColor: "#141414", borderColor: "#2A2A2A" }}>
                <option value="">选择风格</option>
                {STYLE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* 有效期（仅新建） */}
          {!isEdit && (
            <div>
              <label className="mb-2 block text-sm font-medium text-white">有效期 <span style={{ color: "#FF33AA" }}>*</span></label>
              <div className="grid grid-cols-3 gap-2">
                {DURATION_OPTIONS.map((d) => {
                  const active = durationDays === d
                  return (
                    <button key={d} type="button" onClick={() => setDurationDays(d)}
                      className="rounded-lg border px-3 py-2 text-sm transition-colors"
                      style={{ borderColor: active ? "#9933FF" : "#2A2A2A", backgroundColor: active ? "rgba(153,51,255,0.15)" : "transparent", color: active ? "#fff" : "#8A8A8A" }}
                    >{d} 天</button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 上传图片 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-white">上传图片（选填）</label>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            {imagePreview ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="预览" className="h-16 w-16 rounded-lg object-cover" />
                <div className="flex flex-col gap-1">
                  <span className="max-w-[200px] truncate text-xs text-[#8A8A8A]">{imageFile ? imageFile.name : "已有图片"}</span>
                  <button type="button" onClick={removeImage} className="self-start text-xs text-[#FF33AA] hover:underline">移除</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm text-[#8A8A8A] transition-colors hover:text-white"
                style={{ borderColor: "#2A2A2A", backgroundColor: "#141414" }}>
                <ImagePlus className="h-4 w-4" />选择图片
              </button>
            )}
          </div>

          {error && <p className="text-sm" style={{ color: "#FF33AA" }}>{error}</p>}

          {/* 按钮 */}
          <div className="mt-2 flex items-center justify-end gap-3">
            <button type="button" onClick={handleClose} disabled={submitting}
              className="rounded-lg border px-5 py-2 text-sm text-[#8A8A8A] transition-colors hover:text-white disabled:opacity-50"
              style={{ borderColor: "#2A2A2A" }}>取消</button>
            <button type="button" onClick={handleSubmit} disabled={submitting}
              className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "保存修改" : "发布公告"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
