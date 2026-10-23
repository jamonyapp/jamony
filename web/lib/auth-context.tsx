"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"

export type UserInfo = {
  id: number
  nickname: string
  avatarIndex: number
  avatarUrl?: string
  bio: string
  city: string
  primaryInstrument: string
  instrumentCategory: string
  signature: string
  styles?: string[]
  secondaryInstrument: string
  level: number
  points: number
  restriction?: string // 1024: normal|watch|restricted|demoted|banned——申诉tab据此显示提交表单
}

type AuthContextType = {
  user: UserInfo | null
  loggedIn: boolean
  ready: boolean
  login: (nickname: string, password: string) => Promise<string | null>
  register: (nickname: string, password: string, primaryInstrument: string, instrumentCategory?: string) => Promise<string | null>
  logout: () => void
  updateUser: (data: Partial<UserInfo>) => void
  showLoginModal: boolean
  setShowLoginModal: (v: boolean) => void
}

const AuthContext = createContext<AuthContextType>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [ready, setReady] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)

  // 页面加载：先从 localStorage 读缓存（快速展示，避免未登录态闪烁），再调 /api/me 校验 httpOnly cookie 凭证
  useEffect(() => {
    try {
      const saved = localStorage.getItem("jamony_user")
      if (saved) setUser(JSON.parse(saved))
    } catch { /* ignore */ }
    fetch("/api/me", { credentials: "include" })
      .then(async r => {
        // ⑧banned 拦截(1023): 会话仍有效但账号被封 → 跳拦截页(申诉入口在那); 已在拦截页则不再跳(防刷新死循环)
        if (!r.ok && r.status === 401) {
          try { const d = await r.json(); if (d.code === "BANNED") { if (!window.location.pathname.startsWith("/banned")) window.location.href = "/banned"; return null } } catch { /* ignore */ }
        }
        return r.ok ? r.json() : null
      })
      .then(data => {
        if (data && data.ok) {
          setUser(data.user)
          localStorage.setItem("jamony_user", JSON.stringify(data.user))
        } else {
          setUser(null)
          localStorage.removeItem("jamony_user")
        }
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [])

  const login = useCallback(async (nickname: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, password }),
        credentials: "include",
      })
      const data = await res.json()
      if (!data.ok) return data.msg || "登录失败"
      // ⑦封号申诉权(1023): 封号用户登录→跳拦截页(会话仅供申诉两端点使用)
      if (data.banned) { window.location.href = "/banned"; return null }
      setUser(data.user)
      localStorage.setItem("jamony_user", JSON.stringify(data.user))
      return null // null = 成功
    } catch {
      return "网络错误，请检查服务器"
    }
  }, [])

  const register = useCallback(async (nickname: string, password: string, primaryInstrument: string, instrumentCategory?: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, password, primaryInstrument, instrumentCategory }),
        credentials: "include",
      })
      const data = await res.json()
      if (!data.ok) return data.msg || "注册失败"
      setUser(data.user)
      localStorage.setItem("jamony_user", JSON.stringify(data.user))
      return null
    } catch {
      return "网络错误，请检查服务器"
    }
  }, [])

  const updateUser = useCallback((data: Partial<UserInfo>) => {
    setUser(prev => {
      if (!prev) return prev
      const updated = { ...prev, ...data }
      localStorage.setItem("jamony_user", JSON.stringify(updated))
      return updated
    })
  }, [])

  const logout = useCallback(() => {
    const uId = user?.id
    fetch("/api/logout", { method: "POST", credentials: "include" }).catch(() => {})
    setUser(null)
    localStorage.removeItem("jamony_user")
    if (uId) {
      fetch(`/api/users/${uId}/leave-all-rooms`, { method: "POST", credentials: "include" }).catch(() => {})
    }
  }, [user])

  return (
    <AuthContext.Provider value={{ user, loggedIn: !!user, ready, login, register, updateUser, logout, showLoginModal, setShowLoginModal }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
