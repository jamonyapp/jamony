"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Check, LogOut } from "lucide-react"
import { FilterSelect } from "@/components/jamony/filter-select"
import { useAuth } from "@/lib/auth-context"
import { AvatarUpload } from "@/components/jamony/avatar-upload"
import { RegionPicker } from "@/components/jamony/region-picker"
import { splitRegion, isRegionComplete, joinRegion } from "@/lib/regions"

const INSTRUMENTS = ["原声吉他", "电吉他", "贝斯", "打击乐器", "键盘乐器", "主唱", "弦乐", "管乐", "民乐", "其他", "听众"]

const CUSTOM_INSTRUMENT_PLACEHOLDER: Record<string, string> = {
  弦乐: "例如：小提琴、大提琴...",
  管乐: "例如：萨克斯、小号、电吹管",
  民乐: "例如：古筝、二胡、琵琶...",
  其他: "请输入你的乐器",
}

const STYLE_OPTIONS = ["摇滚", "民谣", "爵士", "布鲁斯", "放克", "雷鬼", "电子", "古典", "流行", "嘻哈", "R&B", "国风", "金属", "ACG", "Bossa Nova", "实验"]

const MAX_STYLES = 3

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
  const [nickname, setNickname] = useState("")
  const [signature, setSignature] = useState("")
  const [regionL1, setRegionL1] = useState("") // 1105 地区改造: 两级(广东省|深圳市), 提交拼完整串
  const [regionL2, setRegionL2] = useState("")
  const [ipGuess, setIpGuess] = useState<{ l1: string; l2: string | null } | null>(null)
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
  const [followListPrivate, setFollowListPrivate] = useState(false)
  const [gender, setGender] = useState("")
  const [birthday, setBirthday] = useState("")

  useEffect(() => {
    if (!ready) return
    if (!loggedIn) {
      setShowLoginModal(true)
      return
    }
    setNickname(user?.nickname || "")
    setSignature(user?.signature || "")
    const [gl1, gl2] = splitRegion(user?.city || "") ?? ["", ""] // 旧格式(无空格)拆不了=置空(欢哥定稿不做兼容)
    setRegionL1(gl1)
    setRegionL2(gl2)
    setInstrument(user?.primaryInstrument || "原声吉他")
    setStyles(user?.styles || [])
    setGender(user?.gender || "")
    setBirthday(user?.birthday || "")
    if (user?.id) fetch(`/api/users/${user.id}`).then(r => r.json()).then(d => { if (d.ok) setFollowListPrivate(!!d.user?.follow_list_private) }).catch(() => {})
  }, [ready, loggedIn, user, setShowLoginModal])

  // 1105 地区改造: IP 猜你所在(ip2region 离线库, 内网/库外 available:false 静默不显示)
  useEffect(() => {
    fetch("/api/ip-location").then((r) => r.json()).then((d) => {
      if (d?.available) setIpGuess({ l1: d.l1, l2: d.l2 ?? null })
    }).catch(() => {})
  }, [])

  if (!ready) {
    return <div className="min-h-[60vh] bg-black text-white" />
  }

  if (!loggedIn || !user) {
    return <div className="min-h-[60vh] bg-black text-white" />
  }

  const showCustomInput = instrument in CUSTOM_INSTRUMENT_PLACEHOLDER
  const pwdMismatch = confirmPwd.length > 0 && newPwd !== confirmPwd
  // 1104批次2: undefined兜底true——localStorage老缓存无此字段, /api/me校验后全量替换自动纠正
  const hasPwd = user?.hasPassword ?? true

  const toggleStyle = (s: string) => {
    setStyles((prev) => {
      if (prev.includes(s)) return prev.filter((x) => x !== s)
      if (prev.length >= MAX_STYLES) return prev
      return [...prev, s]
    })
  }

  const handleSave = async () => {
    setSaveError("")
    const finalInstrument = showCustomInput ? customInstrument : instrument
    const cat = instrument
    // 1105 地区改造: 一级有二级时必须选到二级(直辖市一级即完成, 欢哥定稿)
    if (!isRegionComplete(regionL1, regionL2)) {
      setSaveError("地区请选择完整的省/地区 + 城市")
      return
    }
    const city = joinRegion(regionL1, regionL2) // 完整串/直辖市单值(白名单对齐)

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim(),
          signature,
          city,
          primaryInstrument: finalInstrument,
          instrumentCategory: cat,
          styles,
          followListPrivate,
          gender,
          birthday,
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
    // 1104批次2: 无密码号(短信注册)首设免旧密; 有密码号照旧必验旧
    if (pwdMismatch || !newPwd || (hasPwd && !oldPwd)) return
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
      updateUser({ hasPassword: true }) // 1104批次2: 首设成功即时切换「修改密码」态
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
      {/* 09-27 左栏常驻: 原 TopNav backLinks"返回个人主页"由壳层返回箭头承接 */}
      <div className="mx-auto max-w-3xl px-4 pb-28">
        <h1 className="mb-8 text-xl font-bold text-white">个人设置</h1>

        {/* ===== 编辑个人资料 ===== */}
        <SectionTitle>编辑个人资料</SectionTitle>

        {/* 头像 + 保存修改(1106欢哥令: 按钮上移到头像行居右,替1018居中版) */}
        <div className="flex items-center justify-between gap-4">
          <AvatarUpload />
          <button type="button" onClick={handleSave}
            className="flex h-10 shrink-0 items-center justify-center rounded-[10px] px-6 text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }}
          >
            {saved ? <span className="flex items-center gap-1.5"><Check className="h-4 w-4" />已保存</span> : "保存修改"}
          </button>
        </div>
        {saveError && <p className="mt-3 text-right text-xs" style={{ color: "#FF5C5C" }}>{saveError}</p>}

        <div className="mt-6 space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <FieldLabel>昵称</FieldLabel>
              <input type="text" className={inputClass} maxLength={16} style={{ background: "#141414", borderColor: "#2A2A2A" }} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="给自己取个名字" />
            </div>
            <div>
              <FieldLabel>性别</FieldLabel>
              <FilterSelect variant="field" label="选择性别" value={gender} onChange={setGender} className="!py-2.5"
                options={[{ value: "", label: "未设置" }, { value: "male", label: "♂ 男" }, { value: "female", label: "♀ 女" }, { value: "secret", label: "保密" }]} />
            </div>
            <div>
              <FieldLabel hint="仅自己可见">生日</FieldLabel>
              <input type="date" className={inputClass} style={{ background: "#141414", borderColor: "#2A2A2A" }} value={birthday} onChange={(e) => setBirthday(e.target.value)} />
            </div>
          </div>
          <div>
            <FieldLabel hint={`${signature.length}/30`}>签名</FieldLabel>
            <input type="text" className={inputClass} style={{ background: "#141414", borderColor: "#2A2A2A" }} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="一句个性签名..." maxLength={30} />
          </div>
          <div>
            <FieldLabel>地区</FieldLabel>
            <RegionPicker l1={regionL1} l2={regionL2} onL1={setRegionL1} onL2={setRegionL2} guess={ipGuess} />
          </div>
          <div>
            <FieldLabel>主力乐器</FieldLabel>
            <FilterSelect variant="field" label="选择乐器" value={instrument} onChange={setInstrument}
              options={INSTRUMENTS.map((i) => ({ value: i, label: i }))} />
            {showCustomInput && (
              <input type="text" className={`${inputClass} mt-3`} style={{ background: "#141414", borderColor: "#2A2A2A" }} value={customInstrument} onChange={(e) => setCustomInstrument(e.target.value)} placeholder={CUSTOM_INSTRUMENT_PLACEHOLDER[instrument]} />
            )}
          </div>
          <div>
            <FieldLabel hint={`${styles.length}/${MAX_STYLES} · 最多3个`}>风格偏好</FieldLabel>
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

        {/* 隐私：关注/粉丝列表 */}
        <div className="mt-7 flex items-center justify-between rounded-[10px] border border-[#1A1A1A] bg-[#0D0D0D] px-4 py-3.5">
          <div className="pr-3">
            <div className="text-sm text-white">关注/粉丝列表仅自己可见</div>
            <div className="mt-0.5 text-xs" style={{ color: "#6A6A6A" }}>开启后，其他用户无法查看你的关注和粉丝列表</div>
          </div>
          <button type="button" onClick={() => setFollowListPrivate(v => !v)}
            className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
            style={{ background: followListPrivate ? "#9933FF" : "#2A2A2A" }}
            aria-pressed={followListPrivate}>
            <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
              style={{ transform: followListPrivate ? "translateX(20px)" : "translateX(0)" }} />
          </button>
        </div>

        <Divider />

        {/* ===== 账号安全 ===== */}
        <SectionTitle>账号安全</SectionTitle>
        <div className="space-y-5">
          <div>
            <FieldLabel>手机号</FieldLabel>
            <div className="flex items-center justify-between rounded-[10px] border px-3 py-2.5" style={{ borderColor: "#2A2A2A", background: "#141414" }}>
              {user.phoneMasked ? (
                <span className="text-sm text-white">{user.phoneMasked}</span>
              ) : (
                <>
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
                </>
              )}
            </div>
            <p className="mt-1.5 text-xs" style={{ color: "#6A6A6A" }}>
              {user.phoneMasked ? "手机号已验证，可用于登录和找回密码。" : "绑定手机号功能即将开放。"}
            </p>
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

        {/* 1106欢哥令: 改密按钮上移到标题行居右,替1018居中版 */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: "#B0B0B0" }}>{hasPwd ? "修改密码" : "设置密码"}</h3>
          <button type="button" disabled={pwdMismatch || newPwd.length === 0}
            onClick={handleChangePassword}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "#FF33AA" }}>
            {pwdSaved ? <><Check className="h-4 w-4" />{hasPwd ? "已修改" : "已设置"}</> : hasPwd ? "修改密码" : "设置密码"}
          </button>
        </div>
        <div className="space-y-4">
          {hasPwd && <div><FieldLabel>旧密码</FieldLabel><input type="password" className={inputClass} style={{ background: "#141414", borderColor: "#2A2A2A" }} value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} placeholder="请输入当前密码" /></div>}
          <div><FieldLabel>新密码</FieldLabel><input type="password" className={inputClass} style={{ background: "#141414", borderColor: "#2A2A2A" }} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="设置新密码" /></div>
          <div>
            <FieldLabel>确认新密码</FieldLabel>
            <input type="password" className={`${inputClass} ${pwdMismatch ? "!border-[#FF5C5C]" : ""}`} style={{ background: "#141414", borderColor: pwdMismatch ? "#FF5C5C" : "#2A2A2A" }} value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder="再次输入新密码" />
            {pwdMismatch && <p className="mt-1.5 text-xs" style={{ color: "#FF5C5C" }}>两次输入的密码不一致</p>}
            {pwdError && <p className="mt-1.5 text-xs" style={{ color: "#FF5C5C" }}>{pwdError}</p>}
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
