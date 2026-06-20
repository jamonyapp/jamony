"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"

export type UserInfo = {
  id: number
  nickname: string
  avatarIndex: number
  bio: string
  city: string
  primaryInstrument: string
  instrumentCategory: string
  signature: string
  secondaryInstrument: string
  level: number
  points: number
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

  // 页面加载时从 localStorage 恢复登录状态
  useEffect(() => {
    const saved = localStorage.getItem("jamony_user")
    if (saved) {
      try {
        setUser(JSON.parse(saved))
      } catch { /* ignore */ }
    }
    setReady(true)
  }, [])

  const login = useCallback(async (nickname: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, password }),
      })
      const data = await res.json()
      if (!data.ok) return data.msg || "登录失败"
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
    setUser(null)
    localStorage.removeItem("jamony_user")
    if (uId) {
      fetch(`/api/users/${uId}/leave-all-rooms`, { method: "POST" }).catch(() => {})
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
