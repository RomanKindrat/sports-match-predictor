import { VALUE_EDGE_THRESHOLD } from '../constants.js'

export function bookmakerImpliedFromOdds(match) {
  const h = Number(match?.odds_home)
  const d = Number(match?.odds_draw)
  const a = Number(match?.odds_away)
  if (!h || !d || !a || h <= 0 || d <= 0 || a <= 0) return null

  const rawH = 1 / h
  const rawD = 1 / d
  const rawA = 1 / a
  const sum = rawH + rawD + rawA
  if (!sum) return null
  return {
    HomeWin: rawH / sum,
    Draw: rawD / sum,
    AwayWin: rawA / sum,
  }
}

export function valueBetStats(match, prediction) {
  if (!prediction?.probabilities) return null
  const book = bookmakerImpliedFromOdds(match)
  if (!book) return null

  const probs = prediction.probabilities
  const pick = ['HomeWin', 'Draw', 'AwayWin'].reduce((best, key) => (probs[key] > probs[best] ? key : best), 'HomeWin')
  const modelProb = probs[pick]
  const bookProb = book[pick]
  const edge = modelProb - bookProb
  return { pick, modelProb, bookProb, edge }
}

export function isValueBet(edge, threshold = VALUE_EDGE_THRESHOLD) {
  return Number(edge) >= Number(threshold)
}
