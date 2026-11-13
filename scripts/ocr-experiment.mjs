/**
 * OCR 对照实验：对 gen_variants.py 生成的 8 个预处理变体，
 * 分别用 fast(chi_sim 2.4MB) 与 best(chi_sim_best 12.5MB) 模型识别，
 * 输出字符错误率(CER)、耗时与金额是否识别正确（原文出现 186.50）。
 * 运行：node scripts/ocr-experiment.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createWorker } from 'tesseract.js'

const root = path.resolve(import.meta.dirname, '..')
const variantsDir = path.join(os.tmpdir(), 'ocr-exp')

// 与 scripts/measure-metrics.ts 相同的人工转录全文
const GROUND_TRUTH_TEXT = `微信支付账单详情
支付金额
¥ 186.50
当前状态
支付成功
商户全称
海底捞火锅
商品说明
朋友聚餐
支付时间
2026年11月8日 12:30
支付方式
零钱
交易单号
420000241120261108`

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return dp[a.length][b.length]
}

const strip = text => text.replace(/\s+/g, '')

async function runModel(modelName, modelFile) {
  // tesseract.js 按 langPath/chi_sim.traineddata 加载，把对应模型复制为该名字
  const langPath = path.join(variantsDir, `tessdata-${modelName}`)
  fs.mkdirSync(langPath, { recursive: true })
  fs.copyFileSync(path.join(root, modelFile), path.join(langPath, 'chi_sim.traineddata'))

  const results = []
  const worker = await createWorker('chi_sim', 1, { langPath, gzip: false, cachePath: path.join(variantsDir, 'cache'), logger: () => {} })
  await worker.setParameters({ tessedit_pageseg_mode: 6, preserve_interword_spaces: '1' })

  for (const file of fs.readdirSync(variantsDir).filter(name => name.startsWith('variant_') && name.endsWith('.png')).sort()) {
    const startedAt = Date.now()
    const { data } = await worker.recognize(path.join(variantsDir, file))
    const rawText = String(data.text ?? '')
    const cer = levenshtein(strip(GROUND_TRUTH_TEXT), strip(rawText)) / strip(GROUND_TRUTH_TEXT).length
    results.push({
      model: modelName,
      variant: file.replace('variant_', '').replace('.png', ''),
      cerPercent: Number((cer * 100).toFixed(2)),
      amountOk: rawText.includes('186.50'),
      yuanOk: rawText.includes('¥') || rawText.includes('￥'),
      ms: Date.now() - startedAt,
      head: rawText.replace(/\s+/g, ' ').slice(0, 80),
    })
  }
  await worker.terminate()
  return results
}

const all = [
  ...(await runModel('fast', 'chi_sim.traineddata')),
  ...(await runModel('best', 'chi_sim_best.traineddata')),
]
console.table(all.map(({ head, ...rest }) => ({ ...rest })))
fs.writeFileSync(path.join(variantsDir, 'experiment-result.json'), JSON.stringify(all, null, 2))
console.log('saved', path.join(variantsDir, 'experiment-result.json'))
