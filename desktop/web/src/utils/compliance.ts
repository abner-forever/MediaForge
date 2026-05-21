/* ── 敏感词列表 ────────────────────────────── */
// 轻量敏感词库，覆盖微信/微博常见限制词
export const SENSITIVE_WORDS = [
  // 政治敏感
  '习近平', '李克强', '天安门', '法轮功', '六四', '64事件',
  '疆独', '藏独', '台独', '占中', '暴乱',
  // 色情低俗
  '裸聊', '色情', '一夜情', '约炮', '迷奸', '幼女',
  // 违规广告
  '传销', '直销', '返利', '刷单', '代购', '走私',
  // 医疗违规
  '疗效', '根治', '治愈', '秘方', '神药', '特效药',
  // 金融违规
  '稳赚', '保本', '理财收益', '高回报', '涨停',
  // 其他违规
  '赌博', '赌场', '博彩', '假货', '高仿', 'A货',
] as const;

export interface SensitiveWordMatch {
  word: string;
  position: number;
}

export function checkSensitiveWords(text: string): SensitiveWordMatch[] {
  if (!text) return [];
  const results: SensitiveWordMatch[] = [];
  for (const word of SENSITIVE_WORDS) {
    const idx = text.indexOf(word);
    if (idx >= 0) {
      results.push({ word, position: idx });
    }
  }
  return results;
}

/* ── 标题党检测 ────────────────────────────── */

export interface ClickbaitResult {
  level: 'low' | 'medium' | 'high';
  reason: string;
}

const CLICKBAIT_PATTERNS: { pattern: RegExp; level: 'medium' | 'high'; reason: string }[] = [
  { pattern: /!{2,}/g, level: 'high', reason: '标题包含多个感叹号，有标题党嫌疑' },
  { pattern: /[？！]{2,}/g, level: 'medium', reason: '标题包含过多问号/感叹号' },
  { pattern: /(震惊|惊呆|吓傻了|看哭了|疯传|转疯了|千万别|马上删|紧急通知|出大事了)/, level: 'high', reason: '标题含典型标题党用语' },
  { pattern: /(99%|百分之[八九]|所有人都在|每个人都要|不看后悔)/, level: 'high', reason: '标题含夸张数字或绝对化表达' },
  { pattern: /(秘密|真相|内幕|潜规则|深度好文|删前速看)/, level: 'medium', reason: '标题含诱导性词汇' },
  { pattern: /太[过于]?[好美香帅酷爽赞棒强]/, level: 'medium', reason: '标题含过度修饰词' },
];

export function checkClickbaitRisk(title: string): ClickbaitResult[] {
  if (!title) return [];
  const results: ClickbaitResult[] = [];
  for (const { pattern, level, reason } of CLICKBAIT_PATTERNS) {
    if (pattern.test(title)) {
      results.push({ level, reason });
    }
  }
  return results;
}

/* ── 合规摘要 ────────────────────────────── */

export interface ComplianceResult {
  sensitiveWords: SensitiveWordMatch[];
  clickbaitIssues: ClickbaitResult[];
  overallLevel: 'low' | 'medium' | 'high';
}

export function checkCompliance(title: string, content: string): ComplianceResult {
  const sensitiveWords = checkSensitiveWords(title + ' ' + content);
  const clickbaitIssues = checkClickbaitRisk(title);
  const hasHigh = sensitiveWords.length > 0 || clickbaitIssues.some(c => c.level === 'high');
  const hasMedium = clickbaitIssues.some(c => c.level === 'medium');
  return {
    sensitiveWords,
    clickbaitIssues,
    overallLevel: hasHigh ? 'high' : hasMedium ? 'medium' : 'low',
  };
}
