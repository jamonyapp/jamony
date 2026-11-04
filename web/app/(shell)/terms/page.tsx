"use client"

import { AgreementDocPage } from "@/components/jamony/agreement-doc-page"

// 1104批次2步骤三: 用户协议独立页(middleware 对外豁免; 公共组件见 agreement-doc-page)
export default function TermsPage() {
  return <AgreementDocPage kind="user" />
}
