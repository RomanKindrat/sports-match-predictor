import { describe, expect, test } from 'vitest'

import { isStrongEnough, passwordChecks, strengthLabel } from '../../frontend/src/utils/password.js'

describe('password utils', () => {
  test('strengthLabel classifies password strength', () => {
    expect(strengthLabel('')).toBe('weak')
    expect(strengthLabel('abcdefghi')).toBe('weak')
    expect(strengthLabel('Abcdefg1')).toBe('medium')
    expect(strengthLabel('Abcdefg1!')).toBe('strong')
  })

  test('isStrongEnough requires all password rules', () => {
    expect(isStrongEnough('Abcdefg1!')).toBe(true)
    expect(isStrongEnough('abcdefg1!')).toBe(false)
    expect(isStrongEnough('ABCDEFG1!')).toBe(false)
    expect(isStrongEnough('Abcdefgh!')).toBe(false)
    expect(isStrongEnough('Abcdefg12')).toBe(false)
  })

  test('passwordChecks returns rule statuses', () => {
    const checks = passwordChecks('Abcdefg1!')

    expect(checks).toHaveLength(5)
    expect(checks.every((item) => item.ok)).toBe(true)
  })
})
