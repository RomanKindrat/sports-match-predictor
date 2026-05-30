export function isFinishedStatus(status) {
  const s = String(status || '').trim().toLowerCase()
  return ['ft', 'finished', 'full time', 'aet', 'pen'].includes(s)
}

export function predictedOutcome(item) {
  if (item.predicted_outcome) return item.predicted_outcome
  const text = String(item.predicted_result || '').toLowerCase()
  if (text.includes('нічия') || text.includes('draw')) return 'D'
  const home = String(item.home_team || '').toLowerCase()
  const away = String(item.away_team || '').toLowerCase()
  if (home && text.includes(home)) return 'H'
  if (away && text.includes(away)) return 'A'
  return null
}

export function predictedResultLabel(item, lang = 'uk') {
  const raw = String(item?.predicted_result || '').trim()
  const lower = raw.toLowerCase()
  const home = String(item?.home_team || '').trim()
  const away = String(item?.away_team || '').trim()

  if (!raw) return 'Немає прогнозу'
  if (lower.includes('нічия') || lower === 'draw') return 'Нічия'

  if (lower.includes('перемога')) {
    if (home && lower.includes(home.toLowerCase())) return `Перемога ${home}`
    if (away && lower.includes(away.toLowerCase())) return `Перемога ${away}`
  }

  if (home && lower.includes(home.toLowerCase())) return `Перемога ${home}`
  if (away && lower.includes(away.toLowerCase())) return `Перемога ${away}`
  return raw
}

function scoreNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function actualOutcome(item) {
  const hg = scoreNumber(item.final_home_goals)
  const ag = scoreNumber(item.final_away_goals)
  if (hg === null || ag === null) return null
  if (hg > ag) return 'H'
  if (hg < ag) return 'A'
  return 'D'
}

export function resultStatus(item, lang = 'uk') {
  const kickoffTs = item.kickoff ? Date.parse(item.kickoff) : NaN
  const isFutureKickoff = Number.isFinite(kickoffTs) && kickoffTs > Date.now()
  if (isFutureKickoff) return { state: 'pending', label: 'Очікується', isCorrect: null }

  const hg = scoreNumber(item.final_home_goals)
  const ag = scoreNumber(item.final_away_goals)
  const hasScore = hg !== null && ag !== null
  const finished = isFinishedStatus(item.match_status) || hasScore
  if (!finished) return { state: 'pending', label: 'Очікується', isCorrect: null }

  const pred = predictedOutcome(item)
  const actual = actualOutcome(item)
  if (!pred || !actual) return { state: 'pending', label: 'Очікується', isCorrect: null }
  if (pred === actual) return { state: 'success', label: 'Вгадано', isCorrect: true }
  return { state: 'fail', label: 'Не вгадано', isCorrect: false }
}

export function scoreLabel(item) {
  const hg = scoreNumber(item.final_home_goals)
  const ag = scoreNumber(item.final_away_goals)
  if (hg === null || ag === null) return '—'
  return `${hg}:${ag}`
}

export function explainability(item, lang = 'uk') {
  const lines = []
  const p = item.probabilities || {}
  if (typeof p.HomeWin === 'number' && typeof p.AwayWin === 'number') {
    const diff = p.HomeWin - p.AwayWin
    if (diff > 0.08) lines.push('Вища ймовірність перемоги домашньої команди.')
    if (diff < -0.08) lines.push('Вища ймовірність перемоги гостей.')
  }
  if (typeof p.Draw === 'number') {
    if (p.Draw < 0.2) lines.push('Низька ймовірність нічиєї.')
    if (p.Draw > 0.32) lines.push('Підвищена ймовірність нічиєї.')
  }
  if (typeof item.value_edge === 'number') {
    lines.push(item.value_edge > 0 ? 'Є позитивна перевага проти лінії букмекера.' : 'Перевага не підтверджується.')
  }
  return lines
}
