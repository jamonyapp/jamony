"use client"

export function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-border bg-card/40 py-20 text-center">
      <div className="text-6xl">🎵</div>
      <p className="max-w-xs text-pretty text-base text-muted-foreground">
        这个风格还没有房间，来做第一个吧！
      </p>
      <button
        onClick={onCreate}
        className="rounded-[10px] brand-gradient px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-200 hover:brightness-110 active:scale-[0.97]"
      >
        创建房间
      </button>
    </div>
  )
}
