/** @type {import('next').NextConfig} */
const nextConfig = {
  // 2026-09-30 demo 1.0.0: 关闭 ignoreBuildErrors，类型系统重新生效
  //（07-17 修净 6 处后开关一直开着，现 tsc 零错误，CI 守门接棒）
  images: {
    unoptimized: true,
  },
  // 1110b /share 落地页经官网域(jamonyapp.com)代理输出,但其 chunk 必须从 app 域加载——
  // 官网自身是静态导出站且同样使用 /_next 命名空间,官网块已撤 /_next 代理(劫走官网chunk=官网裸奔事故),
  // 绝对前缀让落地页 HTML 引用 https://app.jamonyapp.com/_next/...;app 本域加载同源无感
  assetPrefix: process.env.NODE_ENV === "production" ? "https://app.jamonyapp.com" : undefined,
  // 10-09 GP工作站音源自分发：sonivox 版本化文件名 → immutable 一年缓存（升级=文件名变=缓存自动失效）
  // manifest.json 是指针，短缓存；规则自上而下后者覆盖前者，故 manifest 放最后
  async headers() {
    return [
      { source: '/soundfont/:file*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/soundfont/manifest.json', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }] },
    ]
  },
}

export default nextConfig
