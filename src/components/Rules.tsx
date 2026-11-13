import { ArrowRight, BrainCircuit, CircleCheck, MessageSquareText, Sparkles } from 'lucide-react'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../lib/classifier'
import type { CategoryRule, FeedbackEvent, Transaction } from '../lib/types'

export function Rules({ rules, feedback, transactions }: { rules: CategoryRule[]; feedback: FeedbackEvent[]; transactions: Transaction[] }) {
  const ruleHits = transactions.filter(item => item.categorySource === 'rule').length
  const corrected = transactions.filter(item => item.corrected).length
  return <div className="page rules-page">
    <div className="page-heading"><div><span className="eyebrow">反馈学习中心</span><h1>每一次修正，<br />都让它更懂你。</h1><p>人工修正会沉淀为个人关键词规则，优先于内置规则匹配后续账单。</p></div><div className="learning-badge"><Sparkles /><span><b>本地学习</b><small>规则加密存储 / 仅本人使用</small></span></div></div>

    <section className="learning-hero"><div className="learning-visual"><div className="learn-node"><MessageSquareText /><span>人工修正</span></div><ArrowRight /><div className="learn-node accent"><BrainCircuit /><span>生成规则</span></div><ArrowRight /><div className="learn-node"><CircleCheck /><span>自动分类</span></div></div><div className="learning-copy"><span className="eyebrow light">CLOSED-LOOP LEARNING</span><h2>不是“记住一次”，<br />而是形成可复用的判断。</h2><p>系统从商户名称中提取稳定特征，并与收支方向一起保存。下次遇到相同关键词时，个人规则享有最高优先级。</p></div></section>

    <section className="learning-metrics"><div><span>已学习规则</span><strong>{rules.length}</strong><small>条个人关键词规则</small></div><div><span>人工修正</span><strong>{corrected}</strong><small>条账单被优化</small></div><div><span>规则命中</span><strong>{ruleHits}</strong><small>条账单自动归类</small></div><div><span>反馈样本</span><strong>{feedback.length}</strong><small>次可追踪反馈</small></div></section>

    <div className="learning-grid">
      <section className="card rules-list-card"><div className="section-heading"><div><h2>我的分类规则</h2><p>按权重与命中次数动态排序</p></div><span className="tag">优先级高于内置规则</span></div>{rules.length ? <div className="rule-list">{rules.map(rule => <div className="rule-row" key={rule.id}><span className="rule-keyword">{rule.keyword}</span><ArrowRight size={15} /><span className="rule-category">{rule.category}</span><div className="rule-meta"><span>{rule.direction === 'income' ? '收入' : '支出'}</span><span>命中 {rule.hitCount} 次</span><b>权重 {rule.weight}</b></div></div>)}</div> : <div className="empty-state rules-empty"><BrainCircuit /><h3>还没有个人学习规则</h3><p>去账单明细中修改一条分类，系统会立即在这里生成规则。</p></div>}</section>
      <section className="card feedback-card"><div className="section-heading"><div><h2>最近反馈</h2><p>保留每次分类优化的前后变化</p></div></div>{feedback.length ? <div className="feedback-list">{feedback.slice(0, 10).map(event => <div className="feedback-row" key={event.id}><i /><div><span>{event.oldCategory}<ArrowRight size={12} />{event.newCategory}</span><small>{event.createdAt ? new Date(event.createdAt).toLocaleString('zh-CN') : '刚刚'} · 账单 #{event.transactionId}</small></div></div>)}</div> : <div className="empty-inline"><MessageSquareText />完成分类修正后，反馈记录会显示在这里。</div>}</section>
    </div>

    <section className="card builtin-card"><div className="section-heading"><div><h2>内置分类知识库</h2><p>覆盖常见消费与收入场景，个人规则可随时覆盖</p></div><span className="tag">规则冷启动</span></div><div className="builtin-groups"><div><b>支出分类</b><p>{EXPENSE_CATEGORIES.join(' · ')}</p></div><div><b>收入分类</b><p>{INCOME_CATEGORIES.join(' · ')}</p></div><div><b>匹配策略</b><p>个人规则（权重 100+）→ 内置关键词 → 收支兜底分类。低置信度在导入预览中标记待核对。</p></div></div></section>
  </div>
}
