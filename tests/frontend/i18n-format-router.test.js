import { afterEach, describe, expect, test, vi } from 'vitest'

import { createT, I18N, LANG_KEY } from '../../frontend/src/i18n.js'
import { DISPLAY_TIMEZONE, formatKickoff, probabilitiesLine, toPercent } from '../../frontend/src/utils/format.js'
import { getPath, navigate } from '../../frontend/src/utils/router.js'

describe('i18n and formatting helpers', () => {
  test('createT translates known keys, replaces variables and falls back to key', () => {
    const t = createT('uk')

    expect(LANG_KEY).toBe('ui_lang')
    expect(I18N.en).toBe(I18N.uk)
    expect(t('home_user_subtitle', { name: 'Roman' })).toContain('Roman')
    expect(t('unknown_key')).toBe('unknown_key')
  })

  test('format helpers produce UI labels', () => {
    expect(DISPLAY_TIMEZONE).toBe('Europe/Kyiv')
    expect(formatKickoff(null)).toBe('Невідомий час')
    expect(formatKickoff('not-a-date')).toBe('not-a-date')
    expect(probabilitiesLine({ HomeWin: 0.5, Draw: 0.25, AwayWin: 0.25 })).toBe('H: 50.0% | D: 25.0% | A: 25.0%')
    expect(probabilitiesLine(null)).toBe('')
    expect(toPercent(0.123)).toBe('12.3%')
  })
})

describe('router helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.window
  })

  test('getPath accepts known app routes and redirects unknown paths to login', () => {
    globalThis.window = { location: { pathname: '/history' } }
    expect(getPath()).toBe('/history')

    globalThis.window.location.pathname = '/unknown'
    expect(getPath()).toBe('/login')
  })

  test('navigate pushes history only when path changes', () => {
    const setPathname = vi.fn()
    const pushState = vi.fn()
    globalThis.window = {
      location: { pathname: '/login' },
      history: { pushState },
    }

    navigate('/profile', setPathname)
    expect(pushState).toHaveBeenCalledWith({}, '', '/profile')
    expect(setPathname).toHaveBeenCalledWith('/profile')

    globalThis.window.location.pathname = '/profile'
    navigate('/profile', setPathname)
    expect(pushState).toHaveBeenCalledTimes(1)
  })
})
