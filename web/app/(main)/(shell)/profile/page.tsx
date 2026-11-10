"use client"

import { useEffect, useState } from "react"
import { ProfilePage } from "@/components/jamony/profile-page"

export default function ProfileRoute() {
  const [nickname, setNickname] = useState("")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setNickname(params.get("nickname") || "")
  }, [])

  if (!nickname) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-[#8A8A8A]">请指定要查看的用户</p>
      </div>
    )
  }
  return <ProfilePage nickname={nickname} />
}
