/* 地区数据分发（1105 城市→地区改造）：单一数据源 = ../api/lib/regions-data.json
   Next 构建管线不解析 web 目录外的 import，故复制一份到 web/lib/（派生产物，已 gitignore）。
   挂 prebuild/predev：api 侧改数据后 web 构建自动随迁；api 端白名单 require 的是源文件本体。 */
import { copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(webRoot, '../api/lib/regions-data.json')
const dest = path.join(webRoot, 'lib/regions-data.json')

if (!existsSync(src)) {
  console.error(`[copy-regions] 找不到 ${src}（主仓 api/ 目录在吗？）`)
  process.exit(1)
}
copyFileSync(src, dest)
console.log('[copy-regions] api/lib/regions-data.json → web/lib/ ✓')
