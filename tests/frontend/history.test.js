import { describe, expect, test, vi } from 'vitest'

import {
  actualOutcome,
  explainability,
  isFinishedStatus,
  predictedOutcome,
  predictedResultLabel,
  resultStatus,
  scoreLabel,
} from '../../frontend/src/utils/history.js'

describe('history utils', () => {
  test('isFinishedStatus recognizes finished match statuses', () => {
    expect(isFinishedStatus('FT')).toBe(true)
    expect(isFinishedStatus('finished')).toBe(true)
    expect(isFinishedStatus('NS')).toBe(false)
  })

  test('predictedOutcome resolves home, draw and away predictions', () => {
    expect(predictedOutcome({ predicted_outcome: 'H' })).toBe('H')
    expect(predictedOutcome({ predicted_result: 'Нічия' })).toBe('D')
    expect(predictedOutcome({ predicted_result: 'Перемога Arsenal', home_team: 'Arsenal', away_team: 'Chelsea' })).toBe('H')
    expect(predictedOutcome({ predicted_result: 'Перемога Chelsea', home_team: 'Arsenal', away_team: 'Chelsea' })).toBe('A')
    expect(predictedOutcome({ predicted_result: 'unknown' })).toBeNull()
  })

  test('predictedResultLabel formats common outcomes', () => {
    expect(predictedResultLabel({ predicted_result: '' })).toBe('Немає прогнозу')
    expect(predictedResultLabel({ predicted_result: 'draw' })).toBe('Нічия')
    expect(predictedResultLabel({ predicted_result: 'Перемога Arsenal', home_team: 'Arsenal' })).toBe('Перемога Arsenal')
    expect(predictedResultLabel({ predicted_result: 'Chelsea', away_team: 'Chelsea' })).toBe('Перемога Chelsea')
  })

  test('actualOutcome and scoreLabel use final score', () => {
    expect(actualOutcome({ final_home_goals: 2, final_away_goals: 1 })).toBe('H')
    expect(actualOutcome({ final_home_goals: 1, final_away_goals: 2 })).toBe('A')
    expect(actualOutcome({ final_home_goals: 1, final_away_goals: 1 })).toBe('D')
    expect(actualOutcome({ final_home_goals: null, final_away_goals: 1 })).toBeNull()
    expect(scoreLabel({ final_home_goals: 2, final_away_goals: 1 })).toBe('2:1')
    expect(scoreLabel({})).toBe('—')
  })

  test('resultStatus marks pending, correct and incorrect predictions', () => {
    vi.setSystemTime(new Date('2020-01-02T12:00:00Z'))
    const base = {
      kickoff: '2020-01-01T12:00:00Z',
      match_status: 'FT',
      final_home_goals: 1,
      final_away_goals: 1,
    }

    expect(resultStatus({ kickoff: '2030-01-01T12:00:00Z' })).toEqual({ state: 'pending', label: 'Очікується', isCorrect: null })
    expect(resultStatus({ ...base, predicted_outcome: 'D' })).toEqual({ state: 'success', label: 'Вгадано', isCorrect: true })
    expect(resultStatus({ ...base, predicted_outcome: 'H' })).toEqual({ state: 'fail', label: 'Не вгадано', isCorrect: false })
    expect(resultStatus({ match_status: 'NS' })).toEqual({ state: 'pending', label: 'Очікується', isCorrect: null })
    vi.useRealTimers()
  })

  test('explainability returns readable model hints', () => {
    expect(
      explainability({
        probabilities: { HomeWin: 0.55, Draw: 0.18, AwayWin: 0.25 },
        value_edge: 0.12,
      })
    ).toContain('Вища ймовірність перемоги домашньої команди.')

    expect(
      explainability({
        probabilities: { HomeWin: 0.22, Draw: 0.36, AwayWin: 0.5 },
        value_edge: -0.03,
      })
    ).toContain('Вища ймовірність перемоги гостей.')
  })
})
