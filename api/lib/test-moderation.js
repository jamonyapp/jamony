/**
 * 机审引擎自测脚本（安全样例——用注入的自造词表验证引擎逻辑, 不打印真实词库内容）
 * 运行: node api/lib/test-moderation.js
 */
const { moderateText, getStatus, normalize, buildTrie, scanTrie } = require('./moderation');

let failed = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗ FAIL'} ${name} → ${actual}${ok ? '' : ' (期望 ' + expected + ')'}`);
}

console.log('=== 一、真实词库加载状态 ===');
const st = getStatus();
console.log(`ok=${st.ok} reject词数=${st.rejectWords} suspect词数=${st.suspectWords}${st.error ? ' error=' + st.error : ''}`);
check('词库加载成功', st.ok, true);

console.log('\n=== 二、引擎逻辑（注入自造安全词表） ===');
const TEST_TRIE = buildTrie([
  { word: '测试禁词甲', category: 'test_reject' },
  { word: 'testbanword', category: 'test_reject' },
  { word: '测试疑词乙', category: 'test_suspect' },
]);
const scan = (t) => scanTrie(normalize(t), TEST_TRIE);
const verdictOf = (t) => (scan(t).some(h => h.category === 'test_reject') ? 'reject'
  : scan(t).length > 0 ? 'suspect' : 'pass');

check('干净文本放行', verdictOf('今天天气不错，一起去排练新歌'), 'pass');
check('拒绝词命中', verdictOf('我们聊聊测试禁词甲这件事'), 'reject');
check('疑似词命中', verdictOf('有人说过测试疑词乙吗'), 'suspect');
check('插符号变形仍命中', verdictOf('测试 禁-词*甲'), 'reject');
check('全角+大小写变形(英文)', verdictOf('ＴｅｓｔＢａｎＷｏｒｄ'), 'reject');
check('空格拆散变形(英文)', verdictOf('t e s t b a n w o r d'), 'reject');
check('繁体输入归一命中', verdictOf('測試禁詞甲'), 'reject');
check('空文本放行', verdictOf(''), 'pass');
check('纯符号放行', verdictOf('***---'), 'pass');

console.log('\n=== 三、moderateText 出口一致性（真实词库, 只看判定不打印词） ===');
// 构造安全文本: 确定不含词库词的日常内容
const cleanA = '今晚八点排练, 主音吉他手带好拨片, 鼓手调好底鼓, 我们过一遍副歌';
const cleanB = '新作品封面用蓝紫渐变, 标题就叫午夜电台';
check('日常文本A放行', moderateText(cleanA).verdict, 'pass');
check('日常文本B放行', moderateText(cleanB).verdict, 'pass');
check('返回结构合法', ['pass', 'suspect', 'reject'].includes(moderateText(cleanA).verdict), true);

console.log('\n=== 四、性能 ===');
const longText = (cleanA + cleanB).repeat(50); // ~4000字
const t0 = Date.now();
for (let i = 0; i < 100; i++) moderateText(longText);
console.log(`4000字文本×100次扫描耗时: ${Date.now() - t0}ms`);

console.log(`\n===== 结果: ${failed === 0 ? '全部通过 ✓' : failed + ' 项失败 ✗'} =====`);
process.exit(failed === 0 ? 0 : 1);
