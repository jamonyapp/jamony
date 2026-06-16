"use client"

import { useEffect, useRef, useState } from "react"
import { X, ImagePlus, Megaphone } from "lucide-react"
import {
  type Notice,
  type NoticeType,
  NOTICE_TYPES,
  NOTICE_TYPE_LABEL,
  NOTICE_TYPE_COLOR,
  BG_COUNT,
} from "@/lib/jamony-data"

type PublishNoticeModalProps = {
  open: boolean
  onClose: () => void
  onPublish: (notice: Notice) => void
}

export function PublishNoticeModal({ open, onClose, onPublish }: PublishNoticeModalProps) {
  const [type, setType] = useState<NoticeType | null>(null)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [city, setCity] = useState("")
  const [style, setStyle] = useState("")
  const [imageName, setImageName] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  if (!open) return null

  const reset = () => {
    setType(null)
    setTitle("")
    setBody("")
    setCity("")
    setStyle("")
    setImageName(null)
    setImagePreview(null)
    setError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageName(file.name)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleSubmit = () => {
    if (!type) {
      setError("请选择公告类型")
      return
    }
    if (!title.trim()) {
      setError("请填写标题")
      return
    }
    if (!body.trim()) {
      setError("请填写正文")
      return
    }

    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    const time = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`

    const notice: Notice = {
      id: `new-${Date.now()}`,
      title: title.trim(),
      body: body.trim(),
      author: "我",
      time,
      type,
      city: city.trim() || "其他",
      style: style.trim() || "未分类",
      bgIndex: Math.floor(Math.random() * BG_COUNT) + 1,
      imageUrl: imageName ?? undefined,
    }

    onPublish(notice)
    reset()
    onClose()
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
            发布公告
          </h2>
          <button
            onClick={handleClose}
            className="rounded-md p-1 text-[#8A8A8A] transition-colors hover:bg-[#1A1A1A] hover:text-white"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {/* 公告类型 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-white">
              公告类型 <span style={{ color: "#FF33AA" }}>*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {NOTICE_TYPES.map((t) => {
                const active = type === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
                    style={{
                      borderColor: active ? NOTICE_TYPE_COLOR[t] : "#2A2A2A",
                      backgroundColor: active ? `${NOTICE_TYPE_COLOR[t]}1A` : "transparent",
                      color: active ? "#fff" : "#8A8A8A",
                    }}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: NOTICE_TYPE_COLOR[t] }}
                    />
                    {NOTICE_TYPE_LABEL[t]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 标题 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-white">
              标题 <span style={{ color: "#FF33AA" }}>*</span>
            </label>
            <input
              type="text"
              value={title}
              maxLength={50}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="给你的公告起个名字"
              className="jamony-input w-full rounded-lg border px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-[#5A5A5A]"
              style={{ backgroundColor: "#141414", borderColor: "#2A2A2A" }}
            />
          </div>

          {/* 正文 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-white">
              正文 <span style={{ color: "#FF33AA" }}>*</span>
            </label>
            <textarea
              value={body}
              rows={4}
              onChange={(e) => setBody(e.target.value)}
              placeholder="详细描述你的公告内容..."
              className="jamony-input w-full resize-none rounded-lg border px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-[#5A5A5A]"
              style={{ backgroundColor: "#141414", borderColor: "#2A2A2A" }}
            />
          </div>

          {/* 城市 + 风格 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-white">城市</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="例如：北京"
                className="jamony-input w-full rounded-lg border px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-[#5A5A5A]"
                style={{ backgroundColor: "#141414", borderColor: "#2A2A2A" }}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-white">风格</label>
              <input
                type="text"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder="例如：摇滚"
                className="jamony-input w-full rounded-lg border px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-[#5A5A5A]"
                style={{ backgroundColor: "#141414", borderColor: "#2A2A2A" }}
              />
            </div>
          </div>

          {/* 上传图片 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-white">上传图片（选填）</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
            {imagePreview ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview || "/placeholder.svg"}
                  alt="预览"
                  className="h-16 w-16 rounded-lg object-cover"
                />
                <div className="flex flex-col gap-1">
                  <span className="max-w-[200px] truncate text-xs text-[#8A8A8A]">{imageName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setImageName(null)
                      setImagePreview(null)
                      if (fileInputRef.current) fileInputRef.current.value = ""
                    }}
                    className="self-start text-xs text-[#FF33AA] hover:underline"
                  >
                    移除
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm text-[#8A8A8A] transition-colors hover:text-white"
                style={{ borderColor: "#2A2A2A", backgroundColor: "#141414" }}
              >
                <ImagePlus className="h-4 w-4" />
                选择图片
              </button>
            )}
          </div>

          {error && <p className="text-sm" style={{ color: "#FF33AA" }}>{error}</p>}

          {/* 按钮 */}
          <div className="mt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border px-5 py-2 text-sm text-[#8A8A8A] transition-colors hover:text-white"
              style={{ borderColor: "#2A2A2A" }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }}
            >
              发布公告
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
