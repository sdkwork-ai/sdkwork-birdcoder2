/**
 * Built-in expert-team display copy (Chinese source) and the shared review
 * constraint. Kept in a locale module so the team contract carries structure,
 * not translated prose.
 */
export const TEAM_DESCRIPTIONS = {
  product: '适合需求评审、方案比较与迭代规划。结合用户价值、使用体验和实现成本，明确首版范围、功能优先级及下一步行动。',
  technical: '适合架构设计评审与交付前检查。从架构、安全和质量三个角度定位风险，给出最小修改建议与可执行的验收清单。',
  content: '适合选题规划与内容方向筛选。结合受众需求、平台传播特点和素材依据，提出选题、标题与大纲，标明需要补充的事实材料。',
  data: '适合指标复盘、异常排查与报表分析。先核对数据质量和统计口径，再解释业务变化，给出分析结论、图表方案及待验证问题。',
  research: '适合专题调研、趋势判断与方案决策。梳理可信来源、变化因素和不同方案的利弊，形成有依据的建议，并说明争议与适用条件。',
} as const

/** Shared constraint applied to every built-in team. */
export const TEAM_CONSTRAINTS = '仅进行分析评审；依据不足时明确说明，不擅自修改或发布。'
