const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

function buildUrl(path) {
  if (!API_BASE) return path
  return `${API_BASE}${path}`
}

function parseApiError(data, fallback) {
  const detail = data?.detail
  if (Array.isArray(detail)) {
    const joined = detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item?.msg) return item.msg
        return JSON.stringify(item)
      })
      .join('; ')
    return joined || fallback
  }
  if (typeof detail === 'string') return detail
  return fallback
}

export async function fetchUpcomingMatches({ league = 152, limit = 10 } = {}) {
  const res = await fetch(buildUrl(`/api/matches/upcoming?league=${league}&limit=${limit}`))
  const data = await res.json()
  if (!res.ok) throw new Error(parseApiError(data, 'Failed to load matches'))
  return data
}

export async function fetchPrediction({
  homeTeam,
  awayTeam,
  fixtureId,
  league,
  season,
  kickoff,
  timezone,
  status,
  venue,
  oddsHome,
  oddsDraw,
  oddsAway,
  token,
}) {
  const params = new URLSearchParams({ home_team: homeTeam, away_team: awayTeam })
  if (fixtureId) params.set('fixture_id', String(fixtureId))
  if (league != null) params.set('league', String(league))
  if (season != null) params.set('season', String(season))
  if (kickoff) params.set('kickoff', kickoff)
  if (timezone) params.set('timezone', timezone)
  if (status) params.set('status', status)
  if (venue) params.set('venue', venue)
  if (oddsHome != null) params.set('odds_home', String(oddsHome))
  if (oddsDraw != null) params.set('odds_draw', String(oddsDraw))
  if (oddsAway != null) params.set('odds_away', String(oddsAway))
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await fetch(buildUrl(`/api/predict?${params.toString()}`), { headers })
  const data = await res.json()
  if (!res.ok) throw new Error(parseApiError(data, 'Failed to get prediction'))
  return data
}

export async function registerUser({ name, email, password, confirm_password }) {
  const res = await fetch(buildUrl('/api/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, confirm_password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(parseApiError(data, 'Registration failed'))
  return data
}

export async function verifyEmailCode({ email, code }) {
  const res = await fetch(buildUrl('/api/auth/verify-email'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(parseApiError(data, 'Email verification failed'))
  return data
}

export async function resendCode({ email }) {
  const res = await fetch(buildUrl('/api/auth/resend-code'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(parseApiError(data, 'Failed to resend code'))
  return data
}

export async function loginUser({ email, password }) {
  const res = await fetch(buildUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(parseApiError(data, 'Login failed'))
  return data
}

export async function fetchMe(token) {
  const res = await fetch(buildUrl('/api/auth/me'), {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(parseApiError(data, 'Failed to load profile'))
  return data
}

export async function logoutUser(token) {
  const res = await fetch(buildUrl('/api/auth/logout'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(parseApiError(data, 'Logout failed'))
  return data
}

export async function fetchHistory(token, { limit = 200 } = {}) {
  const res = await fetch(buildUrl(`/api/history?limit=${limit}`), {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(parseApiError(data, 'Failed to load history'))
  return data
}

export async function updateProfileName(token, { name }) {
  const res = await fetch(buildUrl('/api/auth/profile'), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(parseApiError(data, 'Failed to update profile'))
  return data
}

export async function changePassword(token, { current_password, new_password, confirm_new_password }) {
  const res = await fetch(buildUrl('/api/auth/change-password'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ current_password, new_password, confirm_new_password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(parseApiError(data, 'Failed to change password'))
  return data
}
