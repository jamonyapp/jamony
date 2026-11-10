"use client"

import { useEffect, useState } from "react"
import { ManageWorksPage } from "@/components/jamony/manage-works-page"
import { useAuth } from "@/lib/auth-context"

export default function ManageWorksRoute() {
  const [nickname, setNickname] = useState("")
  const { user, ready } = useAuth()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setNickname(params.get("nickname") || user?.nickname || "")
  }, [user?.nickname])

  if (!ready) {
    return <div className="min-h-screen bg-black text-white" />
  }
  if (!nickname) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-[#8A8A8A]">请指定要查看的用户</p>
      </div>
    )
  }
  return <ManageWorksPage nickname={nickname} />
}
