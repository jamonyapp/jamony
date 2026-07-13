// 演奏水平：乐谱力度记号（jamony 语言）
// p=弱 mf=中强 f=强 ff=很强 fff=极强
// 卡片显示 Lv=p，悬停 tooltip 解释

export type Proficiency = 'p' | 'mf' | 'f' | 'ff' | 'fff'

export const PROFICIENCY_MAP: Record<Proficiency, { label: string; desc: string; color: string }> = {
  'p':   { label: '新手局', desc: '开心就好', color: '#7BE495' },   // 绿
  'mf':  { label: '进阶局', desc: '能玩会跟', color: '#5BC0EB' },   // 蓝
  'f':   { label: '熟练局', desc: '稳定输出', color: '#9933FF' },   // 紫
  'ff':  { label: '老炮局', desc: '功夫深厚', color: '#FFC107' },   // 金
  'fff': { label: '大神局', desc: '余音绕梁', color: '#FF33AA' },   // 红
}

export const PROFICIENCY_ORDER: Proficiency[] = ['p', 'mf', 'f', 'ff', 'fff']
