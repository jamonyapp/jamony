/**
 * 机审引擎自测脚本(1104 直切版: 阿里云文本审核增强版真调三用例)
 * 运行: node api/lib/test-moderation.js
 * 用例预期: 正常乐手文本=pass; 色情引流=reject/suspect; 外链=suspect(自有规则)
 */
const { moderateText, getStatus } = require('./moderation');

async function main() {
  const st = getStatus();
  console.log('引擎状态:', JSON.stringify(st));

  const cases = [
    { name: '正常乐手聊天', text: '今晚八点排练,这首歌和弦进行是4536251,鼓手记得带鼓棒', expect: 'pass' },
    { name: '正常技术文本', text: '网络延迟有点高,你那边卡不卡?换个声卡驱动试试', expect: 'pass' },
    { name: '外链导流(自有规则)', text: '看我主页 www.example.com 每天更新', expect: 'suspect' },
    { name: '违禁内容(真词,仅验证云审联通)', text: '出售冰毒k粉联系我', expect: 'reject' },
  ];

  let failed = 0;
  for (const c of cases) {
    const r = await moderateText(c.text);
    const ok = r.verdict === c.expect;
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗ FAIL'} ${c.name} → ${r.verdict} hits=${JSON.stringify(r.hits)}${ok ? '' : ' (期望 ' + c.expect + ')'}`);
  }
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error('测试异常:', e); process.exit(1); });
