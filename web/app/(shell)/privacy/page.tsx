"use client"

import { AgreementDocPage } from "@/components/jamony/agreement-doc-page"

// 1104批次2步骤三补: 隐私政策独立页(与用户协议并轨; middleware 对外豁免)
export default function PrivacyPage() {
  return <AgreementDocPage kind="privacy" />
}
