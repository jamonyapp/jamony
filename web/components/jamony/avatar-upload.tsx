"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, Check, Loader2, X } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { Avatar } from "@/components/jamony/avatar"

const PREVIEW_SIZE = 256

/**
 * 头像上传：选图 → canvas 圆形预览（实时显示裁剪结果）→ 滚轮缩放 + 拖拽选择展示区域 → 确认 toBlob 上传。
 * 预览即最终裁剪结果（canvas drawImage 从原图取对应区域），真裁剪，非 CSS 假 pan/zoom。
 * pan/zoom 时实时重绘 canvas，确认时直接 toBlob。
 */
export function AvatarUpload() {
  const { user, updateUser } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const cropAreaRef = useRef<HTMLDivElement>(null)
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError("")
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        imgRef.current = img
        setImgSrc(reader.result as string)
        setZoom(1)
        setPan({ x: 0, y: 0 })
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  // 实时绘制裁剪预览（预览 = 最终裁剪结果）
  useEffect(() => {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return
    const ctx = canvas.getContext("2d")!
    const imgW = img.width, imgH = img.height
    const cropSize = Math.min(imgW, imgH) / zoom
    const maxPanX = (imgW - cropSize) / 2
    const maxPanY = (imgH - cropSize) / 2
    const clampedX = Math.max(-maxPanX, Math.min(maxPanX, pan.x))
    const clampedY = Math.max(-maxPanY, Math.min(maxPanY, pan.y))
    const sx = imgW / 2 + clampedX - cropSize / 2
    const sy = imgH / 2 + clampedY - cropSize / 2
    ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE)
    ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE)
  }, [imgSrc, zoom, pan])

  // 滚轮缩放（non-passive 阻止页面滚动）
  useEffect(() => {
    const el = cropAreaRef.current
    if (!el || !imgSrc) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      setZoom(z => Math.max(1, Math.min(5, z - e.deltaY * 0.002)))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [imgSrc])

  function onPointerDown(e: React.PointerEvent) {
    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || !imgRef.current) return
    const cropSize = Math.min(imgRef.current.width, imgRef.current.height) / zoom
    const ratio = cropSize / PREVIEW_SIZE // 屏幕像素 → 原图像素
    setPan(p => ({ x: p.x - e.movementX * ratio, y: p.y - e.movementY * ratio }))
  }
  function onPointerUp() { setDragging(false) }

  async function upload() {
    const canvas = canvasRef.current
    if (!canvas || !user) return
    setUploading(true)
    setError("")
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.9)
      )
      const fd = new FormData()
      fd.append("avatar", blob, "avatar.jpg")
      const apiRes = await fetch(`/api/users/${user.id}/avatar`, { method: "POST", body: fd })
      const data = await apiRes.json()
      if (!data.ok) {
        setError(data.msg || "上传失败")
        return
      }
      updateUser({ avatarUrl: data.avatarUrl })
      setImgSrc(null)
    } catch {
      setError("网络错误")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      {imgSrc ? (
        <div
          ref={cropAreaRef}
          className="relative shrink-0 cursor-move overflow-hidden rounded-full"
          style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <canvas ref={canvasRef} width={PREVIEW_SIZE} height={PREVIEW_SIZE} className="h-full w-full" />
        </div>
      ) : (
        <Avatar nickname={user?.nickname || "U"} avatarUrl={user?.avatarUrl} size={72} />
      )}
      <div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onSelect} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-xs transition-colors hover:border-[#3A3A3A] hover:text-white"
          style={{ borderColor: "#2A2A2A", color: "#8A8A8A" }}
        >
          <Camera className="h-3.5 w-3.5" />
          {user?.avatarUrl ? "更换头像" : "上传头像"}
        </button>
        {imgSrc && (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={upload}
                disabled={uploading}
                className="flex items-center gap-1 rounded-[10px] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }}
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {uploading ? "上传中" : "确认"}
              </button>
              <button
                type="button"
                onClick={() => setImgSrc(null)}
                disabled={uploading}
                className="flex items-center gap-1 rounded-[10px] border px-3 py-1.5 text-xs transition-colors hover:border-[#3A3A3A] hover:text-white"
                style={{ borderColor: "#2A2A2A", color: "#8A8A8A" }}
              >
                <X className="h-3.5 w-3.5" />取消
              </button>
            </div>
            <p className="text-[11px]" style={{ color: "#6A6A6A" }}>滚轮缩放，拖拽选择展示区域</p>
          </div>
        )}
        {error && <p className="mt-1.5 text-xs" style={{ color: "#FF5C5C" }}>{error}</p>}
      </div>
    </div>
  )
}
