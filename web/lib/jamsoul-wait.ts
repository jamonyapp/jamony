// 等待 jamsoul 进程真正退出（10-06 切换房间防竞态用）
// 背景：main.js killJamsoul 走 SIGTERM 优雅退出，3 秒超时才 SIGKILL 并置空 jamsoulProcess；
// 若 kill 后立刻 joinRoom 新房，会被 already-running 检查 skip —— 连的还是旧房。
// 因此切换流程必须等 jamsoul-exited 回执；3.2s 超时兜底（对齐 SIGKILL 时限），无论如何放行。
export function waitJamsoulDead(): Promise<void> {
  return new Promise(resolve => {
    let finished = false
    const done = () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      cleanup?.()
      resolve()
    }
    const timer = setTimeout(done, 3200)
    const cleanup = window.jamonyAPI?.onJamsoulExited?.(() => done())
    // 纯浏览器环境无 jamsoul（也收不到事件），直接放行
    if (!cleanup) done()
  })
}
