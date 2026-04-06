export function formatKickoff(raw, lang = 'uk') {
  if (!raw) return lang === 'en' ? 'Unknown time' : 'Невідомий час'
  const dt = new Date(raw)
  if (Number.isNaN(dt.getTime())) return raw
  return dt.toLocaleString(lang === 'en' ? 'en-GB' : 'uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function probabilitiesLine(probabilities) {
  if (!probabilities) return ''
  const h = (probabilities.HomeWin * 100).toFixed(1)
  const d = (probabilities.Draw * 100).toFixed(1)
  const a = (probabilities.AwayWin * 100).toFixed(1)
  return `H: ${h}% | D: ${d}% | A: ${a}%`
}

export function toPercent(value) {
  return `${(value * 100).toFixed(1)}%`
}
