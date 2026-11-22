// 1104 短信验证码: 阿里云 dysmsapi 封装(签名「慧彼文化传媒北京」)
// 机密同 moderation.js: AK 读 /var/jamony/aliyun.env(服务器专有, 不进 git)
// SMS_DRYRUN=true → 不打阿里云, 验证码打 pm2 日志(模板审核期/E2E 用)
const fs = require('fs')

let client = null // null=未初始化 / false=失败 / Dysmsapi client

function getClient() {
  if (client !== null) return client
  try {
    const t = fs.readFileSync('/var/jamony/aliyun.env', 'utf8')
    const id = (t.match(/^ALIYUN_ACCESS_KEY_ID=(.+)$/m) || [])[1]
    const sec = (t.match(/^ALIYUN_ACCESS_KEY_SECRET=(.+)$/m) || [])[1]
    if (!id || !sec) throw new Error('AK 未配置(/var/jamony/aliyun.env)')
    const Dysmsapi = require('@alicloud/dysmsapi20170525')
    const { Config } = require('@alicloud/openapi-client')
    client = new Dysmsapi.default(new Config({
      accessKeyId: id.trim(),
      accessKeySecret: sec.trim(),
      endpoint: 'dysmsapi.aliyuncs.com',
    }))
  } catch (e) {
    console.error('[sms] 客户端初始化失败:', e.message)
    client = false
  }
  return client
}

/**
 * 发验证码. 返回 { dryrun:true } 或 { ok:true }; 失败 throw.
 */
async function sendSmsCode(phone, code) {
  if (process.env.SMS_DRYRUN === 'true') {
    console.log(`[SMS:DRYRUN] ${phone} 验证码=${code}(5分钟内有效)`)
    return { dryrun: true }
  }
  const c = getClient()
  if (!c) throw new Error('短信客户端不可用')
  const templateCode = process.env.SMS_TEMPLATE_CODE
  if (!templateCode) throw new Error('SMS_TEMPLATE_CODE 未配置')
  const Dysmsapi = require('@alicloud/dysmsapi20170525')
  const request = new Dysmsapi.SendSmsRequest({
    phoneNumbers: phone,
    signName: process.env.SMS_SIGN_NAME || '慧彼文化传媒北京',
    templateCode,
    templateParam: JSON.stringify({ code: String(code) }),
  })
  const resp = await c.sendSms(request)
  if (!resp.body || resp.body.code !== 'OK') {
    throw new Error(`阿里云 ${resp.body ? resp.body.code : 'no-resp'}: ${resp.body ? resp.body.message : ''}`)
  }
  return { ok: true }
}

/**
 * 1122 换绑双提醒通知短信(旧号安全提醒+新号绑定确认).
 * 通知类模板与验证码模板不同: SMS_NOTICE_TEMPLATE 待阿里云申请, env 未配置=静默跳过
 * (不报错不阻塞业务), 模板批下来填 env 即生效.
 */
async function sendNoticeSms(phone, templateParam) {
  const templateCode = process.env.SMS_NOTICE_TEMPLATE
  if (!templateCode) {
    console.log(`[SMS:SKIP] ${phone} 通知短信跳过(SMS_NOTICE_TEMPLATE 未配置)`)
    return { skipped: true }
  }
  return sendTemplateSms(phone, templateCode, templateParam)
}

/**
 * 1123 注销完成回执(匿名化执行后, phone 改哨兵前发).
 * 独立模板 env: SMS_DELETE_DONE_TEMPLATE(与换绑通知不同文案,不可共用).
 * 未配置=静默跳过(不阻塞匿名化), 模板批下来填 env 即生效.
 */
async function sendDeletionDoneSms(phone) {
  const templateCode = process.env.SMS_DELETE_DONE_TEMPLATE
  if (!templateCode) {
    console.log(`[SMS:SKIP] ${phone} 注销回执跳过(SMS_DELETE_DONE_TEMPLATE 未配置)`)
    return { skipped: true }
  }
  return sendTemplateSms(phone, templateCode, {})
}

// 通知类发送共用体(模板码由调用方指定)
async function sendTemplateSms(phone, templateCode, templateParam) {
  const c = getClient()
  if (!c) throw new Error('短信客户端不可用')
  const Dysmsapi = require('@alicloud/dysmsapi20170525')
  const request = new Dysmsapi.SendSmsRequest({
    phoneNumbers: phone,
    signName: process.env.SMS_SIGN_NAME || '慧彼文化传媒北京',
    templateCode,
    templateParam: JSON.stringify(templateParam || {}),
  })
  const resp = await c.sendSms(request)
  if (!resp.body || resp.body.code !== 'OK') {
    throw new Error(`阿里云 ${resp.body ? resp.body.code : 'no-resp'}: ${resp.body ? resp.body.message : ''}`)
  }
  return { ok: true }
}

module.exports = { sendSmsCode, sendNoticeSms, sendDeletionDoneSms }
