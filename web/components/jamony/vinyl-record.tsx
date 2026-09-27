// 无封面时的默认唱片纹（16%透明镂空纹，透出品牌渐变底色）
// centered: 圆心垂直居中（详情页封面无底部文字时用；默认 42% 给卡片底部文字留位）
export function VinylRecord({ centered = false }: { centered?: boolean }) {
  return (
    <svg
      className={`pointer-events-none absolute left-1/2 ${centered ? "top-1/2" : "top-[42%]"} h-[68%] w-[68%] -translate-x-1/2 -translate-y-1/2`}
      viewBox="0 0 100 100"
      fill="none"
      style={{ opacity: 0.16 }}
      aria-hidden
    >
      <circle cx="50" cy="50" r="48" fill="#000000" />
      <circle cx="50" cy="50" r="40" stroke="#FFFFFF" strokeWidth="0.6" />
      <circle cx="50" cy="50" r="33" stroke="#FFFFFF" strokeWidth="0.6" />
      <circle cx="50" cy="50" r="26" stroke="#FFFFFF" strokeWidth="0.6" />
      <circle cx="50" cy="50" r="19" stroke="#FFFFFF" strokeWidth="0.6" />
      <circle cx="50" cy="50" r="11" fill="#FFFFFF" />
      <circle cx="50" cy="50" r="2.2" fill="#000000" />
    </svg>
  )
}
