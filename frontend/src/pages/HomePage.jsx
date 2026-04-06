import React, { useMemo, useState } from 'react'
import { formatKickoff, toPercent } from '../utils/format'
import { predictedResultLabel } from '../utils/history'
import { valueBetStats } from '../utils/valueBet'

export default function HomePage({ user, onLogout, matchesState, onReload, onPredict, isGuest = false, onAuthRequired, onGoRegister, lang, t }) {
  const { matches, loading, error, note, predictions, predictLoading, onGoHistory, onGoAnalytics, onGoProfile } = matchesState
  const [period, setPeriod] = useState('current_next_tour')
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState('kickoff_asc')

  const empty = useMemo(() => {
    if (loading) return t('loading_matches')
    if (!matches.length) return note || t('matches_not_found')
    return ''
  }, [loading, matches.length, note, t])

  const visibleMatches = useMemo(() => {
    const now = Date.now()
    const in30days = now + 30 * 24 * 60 * 60 * 1000
    const rows = [...matches].sort((a, b) => {
      const aTs = Date.parse(a.kickoff || '')
      const bTs = Date.parse(b.kickoff || '')
      return (Number.isFinite(aTs) ? aTs : Number.MAX_SAFE_INTEGER) - (Number.isFinite(bTs) ? bTs : Number.MAX_SAFE_INTEGER)
    })

    let periodRows = rows
    if (period === 'next_30_days') {
      periodRows = rows.filter((m) => {
        const ts = Date.parse(m.kickoff || '')
        return Number.isFinite(ts) && ts >= now && ts <= in30days
      })
    } else if (period === 'current_next_tour') {
      // current + next round
      const parseRoundNumber = (roundText) => {
        const text = String(roundText || '')
        const match = text.match(/\d+/)
        return match ? Number(match[0]) : NaN
      }
      const statusesCurrent = new Set(['1H', 'HT', '2H', 'LIVE', 'ET', 'PEN'])
      const liveRounds = rows
        .filter((m) => statusesCurrent.has(String(m.status || '').toUpperCase()))
        .map((m) => parseRoundNumber(m.round))
        .filter((n) => Number.isFinite(n))

      let currentRound = Number.NaN
      if (liveRounds.length) {
        currentRound = Math.min(...liveRounds)
      } else {
        const upcomingRounds = rows
          .filter((m) => {
            const ts = Date.parse(m.kickoff || '')
            return Number.isFinite(ts) && ts >= now
          })
          .map((m) => parseRoundNumber(m.round))
          .filter((n) => Number.isFinite(n))
        if (upcomingRounds.length) currentRound = Math.min(...upcomingRounds)
      }

      if (Number.isFinite(currentRound)) {
        periodRows = rows.filter((m) => {
          const rn = parseRoundNumber(m.round)
          return Number.isFinite(rn) && (rn === currentRound || rn === currentRound + 1)
        })
      } else {
        // Fallback if provider doesn't return round.
        periodRows = rows.filter((m) => {
          const ts = Date.parse(m.kickoff || '')
          return Number.isFinite(ts) && ts >= now
        }).slice(0, 20)
      }
    }

    const q = query.trim().toLowerCase()
    const searched = q
      ? periodRows.filter((m) => {
          const home = String(m.home_team || '').toLowerCase()
          const away = String(m.away_team || '').toLowerCase()
          const venue = String(m.venue || '').toLowerCase()
          return home.includes(q) || away.includes(q) || venue.includes(q)
        })
      : periodRows

    return [...searched].sort((a, b) => {
      const aId = a.fixture_id || `${a.home_team}-${a.away_team}-${a.kickoff}`
      const bId = b.fixture_id || `${b.home_team}-${b.away_team}-${b.kickoff}`
      const aTs = Date.parse(a.kickoff || '')
      const bTs = Date.parse(b.kickoff || '')
      if (sortBy === 'kickoff_desc') return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0)
      if (sortBy === 'team_asc') return String(a.home_team || '').localeCompare(String(b.home_team || ''))
      if (sortBy === 'team_desc') return String(b.home_team || '').localeCompare(String(a.home_team || ''))
      if (sortBy === 'confidence_desc') {
        const aConf = Number(predictions[aId]?.confidence || 0)
        const bConf = Number(predictions[bId]?.confidence || 0)
        return bConf - aConf
      }
      if (sortBy === 'value_desc') {
        const aStats = valueBetStats(a, predictions[aId])
        const bStats = valueBetStats(b, predictions[bId])
        return Number(bStats?.edge || -999) - Number(aStats?.edge || -999)
      }
      return (Number.isFinite(aTs) ? aTs : Number.MAX_SAFE_INTEGER) - (Number.isFinite(bTs) ? bTs : Number.MAX_SAFE_INTEGER)
    })
  }, [matches, period, predictions, query, sortBy])

  return (
    <main className="page view">
      <header className="topbar">
        <div>
          <p className="eyebrow">{t('welcome_back')}</p>
          <h1>{t('home_title')}</h1>
          <p className="hero-text">
            {isGuest ? t('home_guest_subtitle') : t('home_user_subtitle', { name: user?.name || user?.email })}
          </p>
        </div>
        <div className="topbar-actions">
          <button className="secondary" onClick={isGuest ? onAuthRequired : onGoProfile}>
            {t('profile')}
          </button>
          <button className="secondary" onClick={isGuest ? onAuthRequired : onGoAnalytics}>
            {t('dashboard')}
          </button>
          <button className="secondary" onClick={isGuest ? onAuthRequired : onGoHistory}>
            {t('history')}
          </button>
          {isGuest ? (
            <>
              <button className="cta" onClick={onAuthRequired}>
                {t('login')}
              </button>
              <button className="ghost" onClick={onGoRegister}>
                {t('register')}
              </button>
            </>
          ) : (
            <>
              <button className="cta" onClick={onReload} disabled={loading}>
                {loading ? t('reloading') : t('reload_matches')}
              </button>
              <button className="ghost" onClick={onLogout}>
                {t('logout')}
              </button>
            </>
          )}
        </div>
      </header>

      {error && <div className="error">{t('error_prefix')}: {error}</div>}
      {empty && <div className="empty">{empty}</div>}

      {!empty && (
        <section className="home-filters">
          <div className="filter-group">
            {[
              ['current_next_tour', t('current_next_tour')],
              ['next_30_days', t('next_30_days')],
              ['all_season', t('to_season_end')],
            ].map(([key, label]) => (
              <button key={key} className={`chip ${period === key ? 'chip-active' : ''}`} onClick={() => setPeriod(key)}>
                {label}
              </button>
            ))}
          </div>
          <input
            className="search-input"
            placeholder={t('search_team_stadium')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="kickoff_asc">{t('nearest_first')}</option>
            <option value="kickoff_desc">{t('latest_first')}</option>
            <option value="team_asc">{t('team_az')}</option>
            <option value="team_desc">{t('team_za')}</option>
            <option value="confidence_desc">{t('conf_desc')}</option>
            <option value="value_desc">{t('value_desc')}</option>
          </select>
          <div className="home-filters-meta">{t('found')}: {visibleMatches.length}</div>
        </section>
      )}

      <section className="grid">
        {visibleMatches.map((match) => {
          const id = match.fixture_id || `${match.home_team}-${match.away_team}-${match.kickoff}`
          const prediction = predictions[id]
          const isPredicting = Boolean(predictLoading[id])

          return (
            <article className="card" key={id}>
              <div className="teams">
                {match.home_team} vs {match.away_team}
              </div>
              <div className="meta">{formatKickoff(match.kickoff, lang)}</div>
              <div className="meta">{t('stadium')}: {match.venue || '—'}</div>

              <button onClick={() => (isGuest ? onAuthRequired() : onPredict(match))} disabled={!isGuest && isPredicting}>
                {isGuest ? t('login_for_prediction') : isPredicting ? t('calculating') : t('show_prediction')}
              </button>

              <div className="prediction">
                {!prediction && t('prediction_not_requested')}
                {prediction?.error && `${t('error_prefix')}: ${prediction.error}`}
                {prediction && !prediction.error && (
                  <>
                    <div className="winner">
                      {predictedResultLabel(
                        { predicted_result: prediction.predicted_result, home_team: match.home_team, away_team: match.away_team },
                        lang
                      )}
                    </div>
                    <div>{t('confidence')}: {(prediction.confidence * 100).toFixed(1)}%</div>
                    <div className="bars">
                      {[
                        ['HomeWin', 'H'],
                        ['Draw', 'D'],
                        ['AwayWin', 'A'],
                      ].map(([key, label]) => (
                        <div className="bar-row" key={key}>
                          <span className="bar-label">{label}</span>
                          <div className="bar-track">
                            <div className="bar-fill" style={{ width: `${(prediction.probabilities[key] * 100).toFixed(1)}%` }} />
                          </div>
                          <span className="bar-val">{toPercent(prediction.probabilities[key])}</span>
                        </div>
                      ))}
                    </div>
                    {(() => {
                      const stats = valueBetStats(match, prediction)
                      if (!stats) return <div className="value-muted">{t('no_book_odds')}</div>
                      const edgePct = stats.edge * 100
                      return (
                        <div className={edgePct >= 0 ? 'value-box value-good' : 'value-box value-bad'}>
                          <div>{t('bookmaker')}: {toPercent(stats.bookProb)}</div>
                          <div>{t('model')}: {toPercent(stats.modelProb)}</div>
                          <div>{t('value')}: {edgePct >= 0 ? '+' : ''}{edgePct.toFixed(1)}%</div>
                        </div>
                      )
                    })()}
                    {prediction.used_fallback_for?.length > 0 && (
                      <div>{t('fallback_for')}: {prediction.used_fallback_for.join(', ')}</div>
                    )}
                  </>
                )}
              </div>
            </article>
          )
        })}
      </section>
    </main>
  )
}
