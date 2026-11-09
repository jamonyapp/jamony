"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"

export type UserInfo = {
  id: number
  nickname: string
  nicknameUpdatedAt?: string | null // 1106欢哥令: 昵称1年1改——上次改名时间,冷却中设置页禁编
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
  phoneMasked?: string // 1104批次2: 服务端脱敏号, 设置页本人展示(明文永不出库)
  hasPassword?: boolean // 1104批次2: false=短信注册号无密码, 设置页「设置密码」免旧密
  gender?: string // 1105 画像: male|female|secret|空(本人原值)
  birthday?: string // 1105 画像: YYYY-MM-DD, 仅本人可见(他人端点不下发)
}

type AuthContextType = {
  user: UserInfo | null
  loggedIn: boolean
  ready: boolean
  login: (account: string, password: string, versions?: { agreementVersion?: string; privacyVersion?: string }) => Promise<string | null>
  // 1104 短信: 验证码登录(注册登录合一) + 发码 + 忘记密码; register 已退役(注册唯一入口=验证码)
  loginWithSms: (phone: string, code: string, versions?: { agreementVersion?: string; privacyVersion?: string }) => Promise<string | null>
  sendSmsCode: (phone: string, scene: "login" | "reset_password") => Promise<string | null>
  resetPassword: (phone: string, code: string, newPassword: string) => Promise<string | null>
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
  // 1104: ready=「缓存态已应用」即翻true(毫秒级)——右上角登录按钮据此门控, 杜绝SSR静态HTML/首帧的「登录/注册」漏显; me校验在后台纠正终值
  useEffect(() => {
    try {
      const saved = localStorage.getItem("jamony_user")
      if (saved) setUser(JSON.parse(saved))
    } catch { /* ignore */ }
    setReady(true)
    // 1109 强登录: 401(非BANNED)=无有效会话 → 推回登录门(500等非401不踢, 网络错误走catch保持缓存态)
    let kicked = false
    fetch("/api/me", { credentials: "include" })
      .then(async r => {
        // ⑧banned 拦截(1023): 会话仍有效但账号被封 → 跳拦截页(申诉入口在那); 已在拦截页则不再跳(防刷新死循环)
        if (!r.ok && r.status === 401) {
          try { const d = await r.json(); if (d.code === "BANNED") {
            // 1024 BANNED识别: 壳内顺手杀jamsoul(封号后UDP直连仍在房里出声的收口; 浏览器无此API安全跳过)
            try { ;(window as unknown as { jamonyAPI?: { killJamsoul?: () => void } }).jamonyAPI?.killJamsoul?.() } catch { /* ignore */ }
            if (!window.location.pathname.startsWith("/banned")) window.location.href = "/banned"; return null
          } } catch { /* ignore */ }
          kicked = true
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
          // 掉线兜底(与 middleware 双闸互补——middleware 拦"无cookie进来", 这里拦"cookie假/过期"); 豁免页不跳防死循环
          if (kicked && !/^\/(login|banned|terms|privacy|share)/.test(window.location.pathname)) {
            window.location.href = "/login"
          }
        }
      })
      .catch(() => { /* 网络错误保持缓存态 */ })
  }, [])

  const login = useCallback(async (account: string, password: string, versions?: { agreementVersion?: string; privacyVersion?: string }): Promise<string | null> => {
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, password, ...(versions || {}) }),
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

  // 1104 验证码登录: 未注册手机号验证通过=自动注册(注册登录合一)
  const loginWithSms = useCallback(async (phone: string, code: string, versions?: { agreementVersion?: string; privacyVersion?: string }): Promise<string | null> => {
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, ...(versions || {}) }),
        credentials: "include",
      })
      const data = await res.json()
      if (!data.ok) return data.msg || "登录失败"
      if (data.banned) { window.location.href = "/banned"; return null }
      setUser(data.user)
      localStorage.setItem("jamony_user", JSON.stringify(data.user))
      return null
    } catch {
      return "网络错误，请检查服务器"
    }
  }, [])

  const sendSmsCode = useCallback(async (phone: string, scene: "login" | "reset_password"): Promise<string | null> => {
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, scene }),
        credentials: "include",
      })
      const data = await res.json()
      if (!data.ok) return data.msg || "验证码发送失败"
      return null
    } catch {
      return "网络错误，请检查服务器"
    }
  }, [])

  const resetPassword = useCallback(async (phone: string, code: string, newPassword: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, newPassword }),
        credentials: "include",
      })
      const data = await res.json()
      if (!data.ok) return data.msg || "重置失败"
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
    // keepalive: 页面卸载后请求仍送达(离房结算不丢)
    fetch("/api/logout", { method: "POST", credentials: "include", keepalive: true }).catch(() => {})
    setUser(null)
    localStorage.removeItem("jamony_user")
    if (uId) {
      fetch(`/api/users/${uId}/leave-all-rooms`, { method: "POST", credentials: "include", keepalive: true }).catch(() => {})
    }
    // 1024 欢哥抓漏: 登出=会话边界, 整页跳转全量重置 React 状态/Query缓存/socket(杜绝停在旧账号页面)
    // 1109 强登录修正: 直跳 /login(豁免页零302)——原跳 "/" 走 302 链, 与壳 did-fail-load 的 ERR_ABORTED
    // 导航竞态误触发断网页「乐器没插线」; 直跳免竞态且 cookie 清理时序无关(豁免页不看 cookie)
    window.location.href = "/login"
  }, [user])

  return (
    <AuthContext.Provider value={{ user, loggedIn: !!user, ready, login, loginWithSms, sendSmsCode, resetPassword, updateUser, logout, showLoginModal, setShowLoginModal }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
