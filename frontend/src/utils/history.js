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

export function predictedResultLabel(item, lang = 'en') {
  const raw = String(item?.predicted_result || '').trim()
  const lower = raw.toLowerCase()
  const home = String(item?.home_team || '').trim()
  const away = String(item?.away_team || '').trim()

  if (!raw) return lang === 'en' ? 'No prediction' : 'Немає прогнозу'
  if (lower.includes('нічия') || lower === 'draw') return lang === 'en' ? 'Draw' : 'Нічия'

  if (lower.includes('перемога')) {
    if (home && lower.includes(home.toLowerCase())) return lang === 'en' ? `${home} to win` : `Перемога ${home}`
    if (away && lower.includes(away.toLowerCase())) return lang === 'en' ? `${away} to win` : `Перемога ${away}`
  }

  if (home && lower.includes(home.toLowerCase())) return lang === 'en' ? `${home} to win` : raw
  if (away && lower.includes(away.toLowerCase())) return lang === 'en' ? `${away} to win` : raw
  return raw
}

export function actualOutcome(item) {
  const hg = Number(item.final_home_goals)
  const ag = Number(item.final_away_goals)
  if (!Number.isFinite(hg) || !Number.isFinite(ag)) return null
  if (hg > ag) return 'H'
  if (hg < ag) return 'A'
  return 'D'
}

export function resultStatus(item, lang = 'uk') {
  const kickoffTs = item.kickoff ? Date.parse(item.kickoff) : NaN
  const isFutureKickoff = Number.isFinite(kickoffTs) && kickoffTs > Date.now()
  if (isFutureKickoff) return { state: 'pending', label: lang === 'en' ? 'Expected' : 'Очікується', isCorrect: null }

  const hg = Number(item.final_home_goals)
  const ag = Number(item.final_away_goals)
  const hasScore = Number.isFinite(hg) && Number.isFinite(ag)
  const finished = isFinishedStatus(item.match_status) || hasScore
  if (!finished) return { state: 'pending', label: lang === 'en' ? 'Expected' : 'Очікується', isCorrect: null }

  const pred = predictedOutcome(item)
  const actual = actualOutcome(item)
  if (!pred || !actual) return { state: 'pending', label: lang === 'en' ? 'Expected' : 'Очікується', isCorrect: null }
  if (pred === actual) return { state: 'success', label: lang === 'en' ? 'Guessed' : 'Вгадано', isCorrect: true }
  return { state: 'fail', label: lang === 'en' ? 'Not guessed' : 'Не вгадано', isCorrect: false }
}

export function scoreLabel(item) {
  const hg = Number(item.final_home_goals)
  const ag = Number(item.final_away_goals)
  if (!Number.isFinite(hg) || !Number.isFinite(ag)) return '—'
  return `${hg}:${ag}`
}

export function explainability(item, lang = 'uk') {
  const lines = []
  const p = item.probabilities || {}
  if (typeof p.HomeWin === 'number' && typeof p.AwayWin === 'number') {
    const diff = p.HomeWin - p.AwayWin
    if (diff > 0.08) lines.push(lang === 'en' ? 'Higher chance of home team win.' : 'Вища ймовірність перемоги домашньої команди.')
    if (diff < -0.08) lines.push(lang === 'en' ? 'Higher chance of away team win.' : 'Вища ймовірність перемоги гостей.')
  }
  if (typeof p.Draw === 'number') {
    if (p.Draw < 0.2) lines.push(lang === 'en' ? 'Low draw probability.' : 'Низька ймовірність нічиєї.')
    if (p.Draw > 0.32) lines.push(lang === 'en' ? 'Elevated draw probability.' : 'Підвищена ймовірність нічиєї.')
  }
  if (typeof item.value_edge === 'number') {
    lines.push(
      item.value_edge > 0
        ? lang === 'en'
          ? 'There is a positive value edge vs bookmaker line.'
          : 'Є позитивний value edge проти лінії букмекера.'
        : lang === 'en'
          ? 'Value edge does not confirm the bet.'
          : 'Value edge не підтверджує ставку.'
    )
  }
  return lines
}
