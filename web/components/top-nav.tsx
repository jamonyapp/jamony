"use client"

import { useState } from "react"
import { ChevronDown, LogOut, Settings, User } from "lucide-react"

export function TopNav() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">jamony</span>
          <span className="hidden h-4 w-px bg-border sm:block" />
          <span className="hidden text-xs text-muted-foreground sm:block">
            远程合奏
          </span>
        </div>

        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-secondary active:scale-[0.97]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full brand-gradient text-sm font-semibold text-white">
              木
            </span>
            <span className="hidden text-sm font-medium sm:block">木木</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>

          {open && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setOpen(false)}
                aria-hidden
              />
              <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-2xl">
                <MenuItem icon={<User className="h-4 w-4" />} label="个人主页" />
                <MenuItem icon={<Settings className="h-4 w-4" />} label="设置" />
                <div className="my-1 h-px bg-border" />
                <MenuItem
                  icon={<LogOut className="h-4 w-4" />}
                  label="退出登录"
                  danger
                />
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function MenuItem({
  icon,
  label,
  danger,
}: {
  icon: React.ReactNode
  label: string
  danger?: boolean
}) {
  return (
    <button
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-secondary ${
        danger ? "text-destructive" : "text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
