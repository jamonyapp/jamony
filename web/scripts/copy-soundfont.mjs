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

if (!existsSync(srcSf2)) {
  console.error(`[copy-soundfont] 找不到 ${srcSf2}（@coderline/alphatab 装全了吗？）`)
  process.exit(1)
}
mkdirSync(destDir, { recursive: true })
copyFileSync(srcSf2, destSf2)
try { copyFileSync(srcLicense, path.join(destDir, 'LICENSE')) } catch (e) { /* 许可文件缺失不阻塞 */ }
writeFileSync(path.join(destDir, 'manifest.json'), JSON.stringify({ file: `sonivox-${version}.sf2`, version }))
console.log(`[copy-soundfont] sonivox ${version} → public/soundfont/ ✓`)
