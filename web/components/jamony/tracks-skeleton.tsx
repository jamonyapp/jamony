// 作品卡片加载占位 —— 数据 fetch 期间显示，针对数据等待期（Electron 本地页面已就位）
export function TracksSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="aspect-square animate-pulse rounded-[10px] bg-[#141414]"
          style={{ boxShadow: "0 10px 28px rgba(0,0,0,0.5)" }}
        />
      ))}
    </div>
  )
}
