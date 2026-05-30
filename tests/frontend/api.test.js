import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  changePassword,
  fetchHistory,
  fetchMe,
  fetchModelSettings,
  fetchPrediction,
  fetchUpcomingMatches,
  loginUser,
  logoutUser,
  registerUser,
  resendCode,
  updateProfileName,
  verifyEmailCode,
} from '../../frontend/src/api.js'

function mockJsonResponse(data, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(data),
  }
}

describe('api client', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse({ ok: true }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.fetch
  })

  test('fetchUpcomingMatches builds query parameters', async () => {
    await fetchUpcomingMatches({ league: 39, limit: 5 })

    expect(fetch).toHaveBeenCalledWith('/api/matches/upcoming?league=39&limit=5')
  })

  test('fetchModelSettings requests model settings endpoint', async () => {
    await fetchModelSettings()

    expect(fetch).toHaveBeenCalledWith('/api/model/settings')
  })

  test('fetchPrediction sends match parameters and bearer token', async () => {
    await fetchPrediction({
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      fixtureId: 12,
      league: 39,
      season: 2026,
      kickoff: '2026-05-08T12:00:00Z',
      timezone: 'Europe/Kyiv',
      status: 'NS',
      venue: 'Emirates',
      oddsHome: 2.1,
      oddsDraw: 3.2,
      oddsAway: 3.8,
      token: 'abc',
    })

    const [url, options] = fetch.mock.calls[0]
    expect(url).toContain('/api/predict?')
    expect(url).toContain('home_team=Arsenal')
    expect(url).toContain('away_team=Chelsea')
    expect(url).toContain('fixture_id=12')
    expect(options.headers.Authorization).toBe('Bearer abc')
  })

  test('auth endpoints send JSON bodies', async () => {
    await registerUser({ name: 'Roman', email: 'r@test.com', password: 'Passw0rd!', confirm_password: 'Passw0rd!' })
    await verifyEmailCode({ email: 'r@test.com', code: '123456' })
    await resendCode({ email: 'r@test.com' })
    await loginUser({ email: 'r@test.com', password: 'Passw0rd!' })

    expect(fetch.mock.calls[0][0]).toBe('/api/auth/register')
    expect(JSON.parse(fetch.mock.calls[0][1].body).email).toBe('r@test.com')
    expect(fetch.mock.calls[1][0]).toBe('/api/auth/verify-email')
    expect(fetch.mock.calls[2][0]).toBe('/api/auth/resend-code')
    expect(fetch.mock.calls[3][0]).toBe('/api/auth/login')
  })

  test('profile endpoints send authorization header', async () => {
    await fetchMe('token')
    await logoutUser('token')
    await fetchHistory('token', { limit: 25 })
    await updateProfileName('token', { name: 'New name' })
    await changePassword('token', {
      current_password: 'old',
      new_password: 'Newpass1!',
      confirm_new_password: 'Newpass1!',
    })

    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token')
    expect(fetch.mock.calls[1][1].method).toBe('POST')
    expect(fetch.mock.calls[2][0]).toBe('/api/history?limit=25')
    expect(fetch.mock.calls[3][1].method).toBe('PATCH')
    expect(fetch.mock.calls[4][1].method).toBe('POST')
  })

  test('throws readable API error from detail array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse({ detail: [{ msg: 'Invalid email' }, 'Try again'] }, false))

    await expect(loginUser({ email: 'bad', password: 'x' })).rejects.toThrow('Invalid email; Try again')
  })

  test('throws fallback API error when detail is missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockJsonResponse({}, false))

    await expect(fetchUpcomingMatches()).rejects.toThrow('Failed to load matches')
  })
})
