/** @type {import('next').NextConfig} */
const nextConfig = {
  // 2026-09-30 demo 1.0.0: 关闭 ignoreBuildErrors，类型系统重新生效
  //（07-17 修净 6 处后开关一直开着，现 tsc 零错误，CI 守门接棒）
  images: {
    unoptimized: true,
  },
}

export default nextConfig
