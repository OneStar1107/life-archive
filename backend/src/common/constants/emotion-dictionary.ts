/**
 * common/constants/emotion-dictionary.ts
 * 情绪粒度词表（RULER 框架 144 词的常用子集）。
 *
 * 依据产品洞察 #1：把「难受」精确到「憋屈 / 不甘 / 被忽视」。
 * 当前版本用**静态词表**做映射，不接 LLM——
 * 理由：合规等级为 basic，接 LLM 会触发算法备案（见 08 号 D7 的 ai-gen 分支）。
 * 词表可随业务迭代扩充，无需改代码结构。
 */

export interface EmotionEntry {
  /** 粗粒度：用户的原话 */
  raw: string
  /** 精粒度：更精确的说法 */
  refined: string
  polarity: 'positive' | 'neutral' | 'negative'
}

export const EMOTION_DICTIONARY: EmotionEntry[] = [
  // ── 负面：说不清的难受 ──
  { raw: '难受', refined: '憋屈', polarity: 'negative' },
  { raw: '难受', refined: '不甘', polarity: 'negative' },
  { raw: '难受', refined: '被忽视', polarity: 'negative' },
  { raw: '难受', refined: '无处安放', polarity: 'negative' },
  { raw: '不舒服', refined: '说不上来的别扭', polarity: 'negative' },
  { raw: '闷', refined: '郁结', polarity: 'negative' },

  // ── 负面：具体情绪 ──
  { raw: '难过', refined: '失落', polarity: 'negative' },
  { raw: '难过', refined: '遗憾', polarity: 'negative' },
  { raw: '生气', refined: '愤怒', polarity: 'negative' },
  { raw: '生气', refined: '被冒犯', polarity: 'negative' },
  { raw: '生气', refined: '被轻视', polarity: 'negative' },
  { raw: '焦虑', refined: '不确定', polarity: 'negative' },
  { raw: '焦虑', refined: '怕来不及', polarity: 'negative' },
  { raw: '害怕', refined: '不安', polarity: 'negative' },
  { raw: '累', refined: '耗竭', polarity: 'negative' },
  { raw: '累', refined: '被掏空', polarity: 'negative' },
  { raw: '孤独', refined: '没人懂', polarity: 'negative' },
  { raw: '委屈', refined: '不被看见', polarity: 'negative' },
  { raw: '后悔', refined: '想重来', polarity: 'negative' },
  { raw: '压力', refined: '扛不住', polarity: 'negative' },

  // ── 中性 ──
  { raw: '还行', refined: '平静', polarity: 'neutral' },
  { raw: '还行', refined: '平常', polarity: 'neutral' },
  { raw: '一般', refined: '不好不坏', polarity: 'neutral' },
  { raw: '空', refined: '没什么感觉', polarity: 'neutral' },
  { raw: '懵', refined: '还没反应过来', polarity: 'neutral' },

  // ── 正面 ──
  { raw: '开心', refined: '欣慰', polarity: 'positive' },
  { raw: '开心', refined: '被看见', polarity: 'positive' },
  { raw: '开心', refined: '踏实', polarity: 'positive' },
  { raw: '开心', refined: '轻快', polarity: 'positive' },
  { raw: '安心', refined: '稳住了', polarity: 'positive' },
  { raw: '感恩', refined: '被托住', polarity: 'positive' },
  { raw: '有希望', refined: '看得到头', polarity: 'positive' },
  { raw: '骄傲', refined: '做到了', polarity: 'positive' },
  { raw: '被爱', refined: '有人接住我', polarity: 'positive' },
]

/**
 * 依据原话给出精粒度候选。
 * 排序规则：先按原话精确匹配，再按极性一致性，最后保持词表顺序。
 */
export function suggestRefinements(raw: string, polarity?: string): EmotionEntry[] {
  const key = raw.trim()
  const exact = EMOTION_DICTIONARY.filter((e) => e.raw === key)
  if (exact.length === 0) return []

  const sorted = [...exact]
  if (polarity) {
    sorted.sort((a, b) => {
      const am = a.polarity === polarity ? 0 : 1
      const bm = b.polarity === polarity ? 0 : 1
      return am - bm
    })
  }
  return sorted
}

/** 反查：某个精粒度词的粗粒度说法 */
export function rawOf(refined: string): string | null {
  return EMOTION_DICTIONARY.find((e) => e.refined === refined)?.raw ?? null
}
