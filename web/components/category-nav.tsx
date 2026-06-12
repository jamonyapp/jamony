"use client"

import { categories } from "@/lib/rooms-data"

export function CategoryNav({
  activeCategory,
  activeSub,
  onCategoryChange,
  onSubChange,
}: {
  activeCategory: string
  activeSub: string | null
  onCategoryChange: (id: string) => void
  onSubChange: (id: string | null) => void
}) {
  const current = categories.find((c) => c.id === activeCategory)
  const subs = current?.subs ?? []

  return (
    <div className="flex flex-col gap-3">
      {/* primary tabs */}
      <div className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {categories.map((cat) => {
          const active = cat.id === activeCategory
          return (
            <button
              key={cat.id}
              onClick={() => {
                onCategoryChange(cat.id)
                onSubChange(null)
              }}
              className={`relative flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span aria-hidden>{cat.emoji}</span>
              {cat.label}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full brand-gradient" />
              )}
            </button>
          )
        })}
      </div>

      <div className="h-px bg-border" />

      {/* secondary tabs */}
      {subs.length > 0 && (
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <SubChip
            label="全部"
            active={activeSub === null}
            onClick={() => onSubChange(null)}
          />
          {subs.map((sub) => (
            <SubChip
              key={sub.id}
              label={sub.label}
              active={activeSub === sub.id}
              onClick={() => onSubChange(sub.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SubChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 active:scale-[0.97] ${
        active
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-secondary text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  )
}
