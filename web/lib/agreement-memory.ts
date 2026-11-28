// 1128 A2+P2(欢哥定稿): 设备级已签记忆——localStorage 记住本机签过的版本
// 用途①登录窗小字态判据(A2) ②哨兵弹窗同意后同步写(P2, 保证本设备下次登录直接小字态)
// 记忆错位(库无记录/手改/换账号)由服务端带版本补档自愈, 本记忆纯 UX 层
export const SIGNED_AGREEMENTS_KEY = "jamony.signed-agreements"

export function readSignedVersions(): { agreementVersion?: string; privacyVersion?: string } | null {
  try { return JSON.parse(localStorage.getItem(SIGNED_AGREEMENTS_KEY) || "") || null } catch { return null }
}

export function writeSignedVersions(v: { agreementVersion?: string; privacyVersion?: string }) {
  try { localStorage.setItem(SIGNED_AGREEMENTS_KEY, JSON.stringify(v)) } catch { /* ignore */ }
}
