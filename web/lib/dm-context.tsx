"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"

type DMContextValue = {
  drawerOpen: boolean
  activeCid: number | null
  openDrawer: () => void
  openConversation: (targetUserId: number) => Promise<void>
  openExisting: (cid: number) => void
  closeDrawer: () => void
  clearActive: () => void
}

const DMContext = createContext<DMContextValue>(null!)
export function useDM() { return useContext(DMContext) }

export function DMProvider({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeCid, setActiveCid] = useState<number | null>(null)

  const openDrawer = useCallback(() => { setDrawerOpen(true) }, [])
  const closeDrawer = useCallback(() => { setDrawerOpen(false); setActiveCid(null) }, [])
  const clearActive = useCallback(() => { setActiveCid(null) }, [])
  const openExisting = useCallback((cid: number) => { setActiveCid(cid) }, [])

  const openConversation = useCallback(async (targetUserId: number) => {
    try {
      const r = await fetch("/api/messages/conversations", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ targetUserId }),
      })
      const d = await r.json()
      if (d.ok) { setActiveCid(d.conversationId); setDrawerOpen(true) }
    } catch { /* ignore */ }
  }, [])

  return (
    <DMContext.Provider value={{ drawerOpen, activeCid, openDrawer, openConversation, openExisting, closeDrawer, clearActive }}>
      {children}
    </DMContext.Provider>
  )
}
