// jamony 10-07: pdf.js 资产准备脚本（升级 pdfjs 后重跑: node scripts/patch-pdf-worker.mjs）
// 1) worker 拼 polyfill 头——pdf.js v6 假设运行时自带 TC39 提案 Map upsert 方法,
//    Chromium 142(Electron 39) 尚未实装;且 pdf worker 跑在独立 realm,页面 polyfill 够不着
// 2) 拷贝 standard_fonts/cmaps 到 public/——谱子 PDF 常不内嵌字体,不配则升号/降号等字形画豆腐块
import { readFileSync, writeFileSync, cpSync, rmSync } from "fs"
const header = `/* jamony patch: Chromium<144 缺 Map upsert 提案方法, polyfill 头 (scripts/patch-pdf-worker.mjs) */
typeof Map.prototype.getOrInsert!=="function"&&(Map.prototype.getOrInsert=function(k,v){this.has(k)||this.set(k,v);return this.get(k)});
typeof Map.prototype.getOrInsertComputed!=="function"&&(Map.prototype.getOrInsertComputed=function(k,f){this.has(k)||this.set(k,f());return this.get(k)});
typeof Set.prototype.intersection!=="function"&&(Set.prototype.intersection=function(s){const n=new Set;for(const v of this)s.has(v)&&n.add(v);return n});
`
writeFileSync("public/pdf.worker.min.mjs", header + readFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs"))
rmSync("public/pdf-standard-fonts", { recursive: true, force: true })
rmSync("public/pdf-cmaps", { recursive: true, force: true })
cpSync("node_modules/pdfjs-dist/standard_fonts", "public/pdf-standard-fonts", { recursive: true })
cpSync("node_modules/pdfjs-dist/cmaps", "public/pdf-cmaps", { recursive: true })
console.log("✅ pdf assets ready: worker(patch) + standard-fonts + cmaps")
