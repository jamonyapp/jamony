"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, LogOut } from "lucide-react"
import { TopNav } from "@/components/jamony/top-nav"
import { useAuth } from "@/lib/auth-context"

const CITIES = ["北京", "上海", "广州", "深圳", "成都", "杭州", "重庆", "武汉", "西安", "南京", "苏州", "天津", "长沙", "郑州", "东莞", "青岛", "沈阳", "宁波", "昆明", "大连", "厦门", "合肥", "佛山", "福州", "哈尔滨", "济南", "温州", "长春", "石家庄", "常州", "泉州", "南宁", "贵阳", "南昌", "太原", "烟台", "嘉兴", "南通", "金华", "徐州", "海口", "乌鲁木齐", "呼和浩特", "银川", "西宁", "兰州", "拉萨", "三亚", "丽江", "大理"]

const INSTRUMENTS = ["原声吉他", "电吉他", "贝斯", "打击乐器", "键盘乐器", "主唱", "弦乐", "管乐", "民乐", "其他", "听众"]

const CUSTOM_INSTRUMENT_PLACEHOLDER: Record<string, string> = {
  弦乐: "例如：小提琴、大提琴...",
  管乐: "例如：萨克斯、小号、电吹管",
  民乐: "例如：古筝、二胡、琵琶...",
  其他: "请输入你的乐器",
}

const STYLE_OPTIONS = ["摇滚", "民谣", "爵士", "布鲁斯", "放克", "雷鬼", "电子", "古典", "流行", "嘻哈", "R&B", "国风", "金属", "ACG", "Bossa Nova", "实验"]

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #9933FF, #FF33AA)",
  "linear-gradient(135deg, #00AAFF, #9933FF)",
  "linear-gradient(135deg, #FF33AA, #BBEE00)",
  "linear-gradient(135deg, #00AAFF, #BBEE00)",
  "linear-gradient(135deg, #00AAFF, #FF33AA)",
  "linear-gradient(135deg, #9933FF, #BBEE00)",
  "linear-gradient(135deg, #00AAFF, #9933FF)",
  "linear-gradient(135deg, #FF33AA, #00AAFF)",
  "linear-gradient(135deg, #9933FF, #FF5C5C)",
  "linear-gradient(135deg, #BBEE00, #00AAFF)",
  "linear-gradient(135deg, #9933FF, #FF8A3D)",
  "linear-gradient(135deg, #00AAFF, #6A5CFF)",
  "linear-gradient(135deg, #FF33AA, #6A5CFF)",
  "linear-gradient(135deg, #A6FF00, #00AAFF)",
  "linear-gradient(135deg, #00E0A4, #9933FF)",
  "linear-gradient(135deg, #FF8A3D, #FF33AA)",
  "linear-gradient(135deg, #6A5CFF, #00AAFF)",
  "linear-gradient(135deg, #FF5C5C, #FFB000)",
  "linear-gradient(135deg, #00E0A4, #6A5CFF)",
  "linear-gradient(135deg, #A6FF00, #9933FF)",
  "linear-gradient(135deg, #FFB000, #FF33AA)",
  "linear-gradient(135deg, #6A5CFF, #FF33AA)",
  "linear-gradient(135deg, #00AAFF, #00E0A4)",
  "linear-gradient(135deg, #9933FF, #00E0A4)",
  "linear-gradient(135deg, #A6FF00, #FFB000)",
  "linear-gradient(135deg, #00AAFF, #A6FF00)",
  "linear-gradient(135deg, #FF33AA, #FF8A3D)",
  "linear-gradient(135deg, #9933FF, #A6FF00)",
  "linear-gradient(135deg, #00E0A4, #FF33AA)",
  "linear-gradient(135deg, #FF5C5C, #9933FF)",
]

const MAX_STYLES = 5

function Divider() {
  return <div className="my-7 h-px" style={{ background: "#1A1A1A" }} />
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-base font-bold text-white">{children}</h2>
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <label className="text-xs" style={{ color: "#9A9A9A" }}>{children}</label>
      {hint && <span className="text-xs" style={{ color: "#6A6A6A" }}>{hint}</span>}
    </div>
  )
}

const inputClass = "w-full rounded-[10px] border px-3 py-2.5 text-sm text-white placeholder:text-[#6A6A6A] outline-none transition-colors focus:border-[#9933FF]"

export function SettingsPage() {
  const router = useRouter()
  const { user, loggedIn, ready, logout, updateUser, setShowLoginModal } = useAuth()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [pwdError, setPwdError] = useState("")
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [avatarIdx, setAvatarIdx] = useState(0)
  const [nickname, setNickname] = useState("")
  const [bio, setBio] = useState("")
  const [signature, setSignature] = useState("")
  const [city, setCity] = useState("")
  const [instrument, setInstrument] = useState("原声吉他")
  const [customInstrument, setCustomInstrument] = useState("")
  const [styles, setStyles] = useState<string[]>([])
  const [email, setEmail] = useState("")
  const [emailSaved, setEmailSaved] = useState(false)
  const [oldPwd, setOldPwd] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [confirmPwd, setConfirmPwd] = useState("")
  const [pwdSaved, setPwdSaved] = useState(false)
  const [phoneTip, setPhoneTip] = useState(false)

  useEffect(() => {
    if (!ready) return
    if (!loggedIn) {
      setShowLoginModal(true)
      return
    }
    setNickname(user?.nickname || "")
    setBio(user?.bio || "")
    setSignature(user?.signature || "")
    setCity(user?.city || "")
    setInstrument(user?.primaryInstrument || "原声吉他")
    setAvatarIdx(user?.avatarIndex || 0)
  }, [ready, loggedIn, user, setShowLoginModal])

  if (!ready) {
    return <div className="min-h-screen bg-black text-white"><TopNav /></div>
  }

  if (!loggedIn || !user) {
    return <div className="min-h-screen bg-black text-white"><TopNav /></div>
  }

  const showCustomInput = instrument in CUSTOM_INSTRUMENT_PLACEHOLDER
  const pwdMismatch = confirmPwd.length > 0 && newPwd !== confirmPwd

  const toggleStyle = (s: string) => {
    setStyles((prev) => {
      if (prev.includes(s)) return prev.filter((x) => x !== s)
      if (prev.length >= MAX_STYLES) return prev
      return [...prev, s]
    })
  }

  const handleSave = async () => {
    setSaveError("")
    const finalInstrument = INSTRUMENT_NEEDS_INPUT.includes(instrument) ? customInstrument : instrument
    const cat = instrument

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim(),
          bio,
          signature,
          city,
          primaryInstrument: finalInstrument,
          instrumentCategory: cat,
          avatarIndex: avatarIdx,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        setSaveError(data.msg || "保存失败")
        return
      }
      // 更新本地登录状态
      if (data.user) updateUser(data.user)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setSaveError("网络错误")
    }
  }

  const handleChangePassword = async () => {
    if (pwdMismatch || !newPwd || !oldPwd) return
    setPwdError("")
    try {
      const res = await fetch(`/api/users/${user.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
      })
      const data = await res.json()
      if (!data.ok) {
        setPwdError(data.msg || "修改失败")
        return
      }
      setPwdSaved(true)
      setOldPwd("")
      setNewPwd("")
      setConfirmPwd("")
      setTimeout(() => setPwdSaved(false), 2000)
    } catch {
      setPwdError("网络错误")
    }
  }

  const handleLogout = () => {
    logout()
    router.push("/")
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav backLinks={[{ label: "返回个人主页", href: `/profile?nickname=${encodeURIComponent(user.nickname)}` }]} />
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-16">
        <h1 className="mb-8 text-xl font-bold text-white">个人设置</h1>

        {/* ===== 编辑个人资料 ===== */}
        <SectionTitle>编辑个人资料</SectionTitle>

        {/* 头像 */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setAvatarOpen((v) => !v)}
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full text-2xl font-semibold text-white transition-transform hover:scale-[1.03]"
            style={{ background: AVATAR_GRADIENTS[avatarIdx % AVATAR_GRADIENTS.length] }}
          >
            {nickname?.charAt(0) || "U"}
          </button>
          <div>
            <p className="text-sm font-medium text-white">头像</p>
            <button
              type="button"
              onClick={() => setAvatarOpen((v) => !v)}
              className="mt-0.5 text-xs transition-colors hover:text-[#B0B0B0]"
              style={{ color: "#8A8A8A" }}
            >
              点击更换头像
            </button>
          </div>
        </div>

        {avatarOpen && (
          <div className="mt-4 rounded-[14px] border p-4" style={{ borderColor: "#2A2A2A", background: "#141414" }}>
            <p className="mb-3 text-xs" style={{ color: "#9A9A9A" }}>选择一个预设头像</p>
            <div className="grid grid-cols-6 gap-3">
              {AVATAR_GRADIENTS.map((g, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setAvatarIdx(i); setAvatarOpen(false) }}
                  className={`flex h-12 w-12 items-center justify-center rounded-full transition-transform hover:scale-105 ${avatarIdx === i ? "ring-2 ring-white ring-offset-2 ring-offset-[#141414]" : ""}`}
                  style={{ background: g }}
                >
                  {avatarIdx === i && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 space-y-5">
          <div>
            <FieldLabel>昵称</FieldLabel>
            <input type="text" className={inputClass} style={{ background: "#141414", borderColor: "#2A2A2A" }} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="给自己取个名字" />
          </div>
          <div>
            <FieldLabel hint={`${signature.length}/40`}>签名</FieldLabel>
            <input type="text" className={inputClass} style={{ background: "#141414", borderColor: "#2A2A2A" }} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="一句个性签名..." maxLength={40} />
          </div>
          <div>
            <FieldLabel hint={`${bio.length}/100`}>个人简介</FieldLabel>
            <textarea className={`${inputClass} min-h-[88px] resize-none`} style={{ background: "#141414", borderColor: "#2A2A2A" }} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="介绍一下自己..." maxLength={100} />
          </div>
          <div>
            <FieldLabel>城市</FieldLabel>
            <div className="relative">
              <select value={city} onChange={(e) => setCity(e.target.value)} className={`${inputClass} appearance-none pr-9`} style={{ background: "#141414", borderColor: "#2A2A2A" }}>
                <option value="" className="bg-[#141414] text-[#6A6A6A]">选择所在城市</option>
                {CITIES.map((c) => (<option key={c} value={c} className="bg-[#141414] text-white">{c}</option>))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "#8A8A8A" }} />
            </div>
          </div>
          <div>
            <FieldLabel>主力乐器</FieldLabel>
            <div className="relative">
              <select value={instrument} onChange={(e) => setInstrument(e.target.value)} className={`${inputClass} appearance-none pr-9`} style={{ background: "#141414", borderColor: "#2A2A2A" }}>
                {INSTRUMENTS.map((i) => (<option key={i} value={i} className="bg-[#141414] text-white">{i}</option>))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "#8A8A8A" }} />
            </div>
            {showCustomInput && (
              <input type="text" className={`${inputClass} mt-3`} style={{ background: "#141414", borderColor: "#2A2A2A" }} value={customInstrument} onChange={(e) => setCustomInstrument(e.target.value)} placeholder={CUSTOM_INSTRUMENT_PLACEHOLDER[instrument]} />
            )}
          </div>
          <div>
            <FieldLabel hint={`${styles.length}/${MAX_STYLES}`}>擅长风格</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {STYLE_OPTIONS.map((s) => {
                const active = styles.includes(s)
                const disabled = !active && styles.length >= MAX_STYLES
                return (
                  <button key={s} type="button" onClick={() => toggleStyle(s)} disabled={disabled}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${active ? "border-transparent" : disabled ? "cursor-not-allowed" : "hover:border-[#3A3A3A] hover:text-white"}`}
                    style={active ? { color: "#00AAFF", backgroundColor: "rgba(0,170,255,0.12)" } : { borderColor: "#2A2A2A", color: disabled ? "#5A5A5A" : "#B0B0B0" }}
                  >{s}</button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-7 flex justify-end">
          <button type="button" onClick={handleSave}
            className="flex h-10 items-center justify-center rounded-[10px] px-6 text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }}
          >
            {saved ? <span className="flex items-center gap-1.5"><Check className="h-4 w-4" />已保存</span> : "保存修改"}
          </button>
        </div>
        {saveError && <p className="mt-3 text-right text-xs" style={{ color: "#FF5C5C" }}>{saveError}</p>}

        <Divider />

        {/* ===== 账号安全 ===== */}
        <SectionTitle>账号安全</SectionTitle>
        <div className="space-y-5">
          <div>
            <FieldLabel>手机号</FieldLabel>
            <div className="flex items-center justify-between rounded-[10px] border px-3 py-2.5" style={{ borderColor: "#2A2A2A", background: "#141414" }}>
              <span className="text-sm" style={{ color: "#B0B0B0" }}>未绑定</span>
              <div className="relative">
                <button type="button" onClick={() => { setPhoneTip(true); setTimeout(() => setPhoneTip(false), 2000) }}
                  className="cursor-not-allowed rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: "#2A2A2A", color: "#6A6A6A" }}>
                  绑定手机号
                </button>
                {phoneTip && (
                  <span className="absolute -top-8 right-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs shadow-lg" style={{ background: "#0D0D0D", color: "#B0B0B0", boxShadow: "0 0 0 1px #2A2A2A" }}>
                    暂未开放
                  </span>
                )}
              </div>
            </div>
            <p className="mt-1.5 text-xs" style={{ color: "#6A6A6A" }}>短信服务暂未开通，绑定功能即将上线。</p>
          </div>
          <div>
            <FieldLabel hint="选填">邮箱</FieldLabel>
            <div className="flex gap-2">
              <input type="email" className={inputClass} style={{ background: "#141414", borderColor: "#2A2A2A" }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" />
              <button type="button" onClick={async () => { await fetch(`/api/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }); setEmailSaved(true); setTimeout(() => setEmailSaved(false), 2000) }}
                className="shrink-0 rounded-[10px] border px-4 text-sm transition-colors hover:border-[#3A3A3A] hover:text-white" style={{ borderColor: "#2A2A2A", color: "#B0B0B0" }}>
                {emailSaved ? "已保存" : "保存"}
              </button>
            </div>
          </div>
        </div>

        <Divider />

        <h3 className="mb-4 text-sm font-semibold" style={{ color: "#B0B0B0" }}>修改密码</h3>
        <div className="space-y-4">
          <div><FieldLabel>旧密码</FieldLabel><input type="password" className={inputClass} style={{ background: "#141414", borderColor: "#2A2A2A" }} value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} placeholder="请输入当前密码" /></div>
          <div><FieldLabel>新密码</FieldLabel><input type="password" className={inputClass} style={{ background: "#141414", borderColor: "#2A2A2A" }} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="设置新密码" /></div>
          <div>
            <FieldLabel>确认新密码</FieldLabel>
            <input type="password" className={`${inputClass} ${pwdMismatch ? "!border-[#FF5C5C]" : ""}`} style={{ background: "#141414", borderColor: pwdMismatch ? "#FF5C5C" : "#2A2A2A" }} value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder="再次输入新密码" />
            {pwdMismatch && <p className="mt-1.5 text-xs" style={{ color: "#FF5C5C" }}>两次输入的密码不一致</p>}
            {pwdError && <p className="mt-1.5 text-xs" style={{ color: "#FF5C5C" }}>{pwdError}</p>}
          </div>
          <div className="flex justify-end">
            <button type="button" disabled={pwdMismatch || newPwd.length === 0}
              onClick={handleChangePassword}
              className="flex h-9 items-center gap-1.5 rounded-[10px] border px-4 text-sm text-white transition-colors hover:border-[#3A3A3A] disabled:cursor-not-allowed" style={{ borderColor: "#2A2A2A", color: pwdMismatch || newPwd.length === 0 ? "#5A5A5A" : "#FFFFFF" }}>
              {pwdSaved ? <><Check className="h-4 w-4" />已修改</> : "修改密码"}
            </button>
          </div>
        </div>

        <Divider />

        <div className="flex justify-center pt-2">
          <button type="button" onClick={handleLogout}
            className="flex items-center gap-2 rounded-[10px] border px-5 py-2.5 text-sm transition-colors hover:border-[#FF5C5C]/40 hover:bg-[#FF5C5C]/5" style={{ borderColor: "#2A2A2A", color: "#FF5C5C" }}>
            <LogOut className="h-4 w-4" />退出登录
          </button>
        </div>
      </div>
    </div>
  )
}
