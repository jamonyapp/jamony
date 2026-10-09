/* 音源自分发（10-09 GP工作站前置活）：alphaTab 自带 sonivox 复制到 public/soundfont/
   版本化文件名 = immutable 长缓存的锚点；manifest.json 给前端指路。
   挂 prebuild/predev：升级 alphaTab 时音源自动随迁（版本变=文件名变=缓存自动失效），免手工。
   public/soundfont/ 整目录为派生产物，已 gitignore（rsync 部署时随 public 上服务器）。 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
// alphatab 的 exports 不含 ./package.json 子路径，从主入口回溯包根（dist/xxx.js → 包根）
const mainPath = require.resolve('@coderline/alphatab')
const pkgRoot = path.dirname(path.dirname(mainPath))
const version = JSON.parse(readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')).version

const srcSf2 = path.join(pkgRoot, 'dist/soundfont/sonivox.sf2')
const srcLicense = path.join(pkgRoot, 'dist/soundfont/LICENSE')
const destDir = path.join(webRoot, 'public/soundfont')
const destSf2 = path.join(destDir, `sonivox-${version}.sf2`)
// worker 文件（10-09 步骤③指针·二修）：blob worker 里 importScripts 解析不了相对URL、也咽不下ESM语法
// （欢哥实测卷宗：importScripts '/alphatab/alphaTab.worker.mjs' is invalid）
// → 自托管【经典构建】alphaTab.js（自包含、自带worker环境自检测），scriptFile 必须配完整绝对URL（组件侧拼）
const srcWorkerClassic = path.join(pkgRoot, 'dist/alphaTab.js')
const destWorkerDir = path.join(webRoot, 'public/alphatab')

if (!existsSync(srcSf2)) {
  console.error(`[copy-soundfont] 找不到 ${srcSf2}（@coderline/alphatab 装全了吗？）`)
  process.exit(1)
}
mkdirSync(destDir, { recursive: true })
copyFileSync(srcSf2, destSf2)
try { copyFileSync(srcLicense, path.join(destDir, 'LICENSE')) } catch (e) { /* 许可文件缺失不阻塞 */ }
if (existsSync(srcWorkerClassic)) {
  mkdirSync(destWorkerDir, { recursive: true })
  copyFileSync(srcWorkerClassic, path.join(destWorkerDir, 'alphaTab.js'))
  // 目录治权：只留经典构建，清掉一切历史残留（.mjs对/旧版本命名）
  const canonical = new Set(['alphaTab.js'])
  const { readdirSync, unlinkSync } = await import('node:fs')
  for (const f of readdirSync(destWorkerDir)) if (!canonical.has(f)) { try { unlinkSync(path.join(destWorkerDir, f)) } catch (e) { /* 忽略 */ } }
} else {
  console.warn('[copy-soundfont] dist/alphaTab.js 缺失，worker 未分发（指针将不可用）')
}
writeFileSync(
  path.join(destDir, 'manifest.json'),
  JSON.stringify({ file: `sonivox-${version}.sf2`, version, worker: 'alphaTab.js' })
)
console.log(`[copy-soundfont] sonivox ${version} + classic worker → public/{soundfont,alphatab}/ ✓`)
