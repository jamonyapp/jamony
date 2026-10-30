import { useEffect, useId, useRef } from "react"

/* 全站空格仲裁器（1031 欢哥拍板，Guitar Pro 肌肉记忆：空格=播放/暂停）
   一页一监听，谁后注册（=视觉顶层）谁独享空格；注销自动回落次顶层。
   注册者：混音器三租户（试听/发布/program，isOpen 时）、GP 谱工作站（挂载即注册）。
   豁免：焦点在输入框（INPUT/TEXTAREA/富文本）不拦截；
   无注册者不拦截——空格还给页面默认行为（滚动等）。 */
type Entry = { id: string; fire: () => void }
const stack: Entry[] = []
let installed = false

function install() {
  if (installed) return
  installed = true
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.code !== "Space" && e.key !== " ") return
    const el = e.target as HTMLElement | null
    if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable) return
    const top = stack[stack.length - 1]
    if (!top) return
    e.preventDefault()
    top.fire()
  })
}

// active=true 时注册（后注册=顶层=空格独享）；false/卸载时注销。
// handler 走 ref，每次按键都拿到最新闭包，不因重渲染重排栈序。
export function useSpaceControl(active: boolean, handler: () => void) {
  const id = useId()
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!active) return
    install()
    const entry: Entry = { id, fire: () => ref.current() }
    const existing = stack.findIndex(e => e.id === id)
    if (existing >= 0) stack[existing] = entry
    else stack.push(entry)
    return () => {
      const i = stack.findIndex(e => e.id === id)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [active, id])
}
