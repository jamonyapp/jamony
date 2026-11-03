"use client"

// 1103 欢哥（内测反馈第2条）：工具面板上传成功 toast——照录音落档 toast 范式（center-column recToast）：
// absolute 悬浮列表顶（不挤占布局不顶列表）+ 宽度=列表框等宽 + 5s 自动淡出 + 右上叉子可手动关。
// 1103 欢哥验收追改：圆角与谱子/轨列表框一致（rounded-[8px]，toast 顶角与列表框圆角同心贴合）。
// 失败侧不归它：乐谱/Program 各自的红条承担。
import type { LucideIcon } from "lucide-react"
import { X } from "lucide-react"

export function UploadToast({ msg, icon: Icon, onClose }: {
  msg: string
  icon: LucideIcon
  onClose: () => void
}) {
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 rounded-[8px] bg-brand-pink/70 px-3 py-0 text-xs font-medium leading-tight shadow-md text-white">
      <Icon className="size-3 shrink-0" />
      {msg}
      <button onClick={onClose} title="关闭"
        className="absolute right-1.5 grid size-4 place-items-center rounded-[6px] text-white/70 transition-colors hover:bg-white/15 hover:text-white">
        <X className="size-2.5" />
      </button>
    </div>
  )
}
