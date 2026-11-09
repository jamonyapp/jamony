"use client"

import { useEffect } from "react"

// 1110 微信自定义卡片:wx.config(签名来自 /api/wechat/signature,对单 URL+2h 有效,泄露无害)
// → updateAppMessageShareData / updateTimelineShareData(新接口;onMenuShareXXX 系已废弃)。
// 卡片:标题=作品名 / 描述=1110b 定稿「署名的合奏作品,来 jamony 一起玩!」/ 缩略图=封面(绝对地址,
// 无封面兜底 jamony_logo——微信服务器要能拉到,空串=卡片无图,1110b 欢哥实测踩过)。
// 非微信浏览器(微博/桌面)静默跳过;签名失败=微信默认卡片兜底,不阻塞页面。
export function WechatShare({ title, desc, coverUrl }: { title: string; desc: string; coverUrl: string }) {
  useEffect(() => {
    if (!/MicroMessenger/i.test(navigator.userAgent)) return
    const s = document.createElement("script")
    s.src = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js"
    s.onload = async () => {
      const wx = (window as unknown as { wx?: any }).wx
      if (!wx) return
      // 签名 URL 必须 = 当前页地址(去掉 hash);页面在 jamonyapp.com,签名接口在 app 子域(端点带 CORS)
      const url = window.location.href.split("#")[0]
      const api = url.startsWith("https://jamonyapp.com") ? "https://app.jamonyapp.com" : ""
      try {
        const r = await fetch(`${api}/api/wechat/signature?url=${encodeURIComponent(url)}`)
        const d = await r.json()
        if (!d || !d.ok) return
        wx.config({
          debug: false,
          appId: d.appId,
          timestamp: d.timestamp,
          nonceStr: d.nonceStr,
          signature: d.signature,
          jsApiList: ["updateAppMessageShareData", "updateTimelineShareData"],
        })
        wx.ready(() => {
          wx.updateAppMessageShareData({
            title,
            desc,
            link: url,
            imgUrl: coverUrl,
          })
          wx.updateTimelineShareData({ title: `${title} - ${desc}`, link: url, imgUrl: coverUrl })
        })
      } catch {
        /* 网络异常=默认卡片兜底 */
      }
    }
    document.head.appendChild(s)
    return () => {
      s.remove()
    }
  }, [title, desc, coverUrl])
  return null
}
