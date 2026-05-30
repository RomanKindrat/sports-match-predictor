import { describe, expect, test } from 'vitest'

import { bookmakerImpliedFromOdds, isValueBet, valueBetStats } from '../../frontend/src/utils/valueBet.js'

describe('value bet utils', () => {
  test('bookmakerImpliedFromOdds normalizes bookmaker odds into probabilities', () => {
    const result = bookmakerImpliedFromOdds({ odds_home: 2, odds_draw: 4, odds_away: 4 })

    expect(result.HomeWin).toBe(0.5)
    expect(result.Draw).toBe(0.25)
    expect(result.AwayWin).toBe(0.25)
  })

  test('bookmakerImpliedFromOdds returns null when odds are incomplete or invalid', () => {
    expect(bookmakerImpliedFromOdds({ odds_home: 2, odds_draw: 4 })).toBeNull()
    expect(bookmakerImpliedFromOdds({ odds_home: 2, odds_draw: 0, odds_away: 4 })).toBeNull()
  })

  test('valueBetStats selects strongest model outcome and calculates edge', () => {
    const stats = valueBetStats(
      { odds_home: 2, odds_draw: 4, odds_away: 4 },
      { probabilities: { HomeWin: 0.4, Draw: 0.2, AwayWin: 0.4 } }
    )

    expect(stats.pick).toBe('HomeWin')
    expect(stats.modelProb).toBe(0.4)
    expect(stats.bookProb).toBe(0.5)
    expect(Number(stats.edge.toFixed(2))).toBe(-0.1)
  })

  test('valueBetStats returns null without prediction probabilities or bookmaker odds', () => {
    expect(valueBetStats({ odds_home: 2, odds_draw: 4, odds_away: 4 }, null)).toBeNull()
    expect(valueBetStats({ odds_home: 2 }, { probabilities: { HomeWin: 0.4 } })).toBeNull()
  })

  test('isValueBet applies selected threshold', () => {
    expect(isValueBet(0.16, 0.15)).toBe(true)
    expect(isValueBet(0.14, 0.15)).toBe(false)
  })
})
