import { WorkDetailPage } from "@/components/jamony/work-detail-page"

// SSR：作品 id 运行时动态渲染，不再预渲染（原 generateStaticParams 1-18 已删）

export default function DetailRoute() {
  return <WorkDetailPage />
}
