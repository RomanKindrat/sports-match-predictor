import React, { useEffect, useMemo, useState } from 'react'
import { formatKickoff, probabilitiesLine, toPercent } from '../utils/format'
import { explainability, predictedResultLabel, resultStatus, scoreLabel } from '../utils/history'

function metric(value, label) {
  return { value, label }
}

function StatusPill({ state, label }) {
  return <span className={`status-pill ${state}`}>{label}</span>
}

function DetailsModal({ item, onClose, t, lang }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const rs = resultStatus(item, lang)
  const p = item.probabilities || {}
  const modelExplain = explainability(item, lang)
  const hasBook = item.odds_home && item.odds_draw && item.odds_away
  const implied = item.bookmaker_probs || null

  return (
    <div className="history-modal-backdrop" onClick={onClose}>
      <div className="history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="history-modal-head">
          <h2>
            {item.home_team} vs {item.away_team}
          </h2>
          <button className="ghost" onClick={onClose}>
            {t('cancel')}
          </button>
        </div>

        <section className="history-section">
          <h3>{t('match')}</h3>
          <div className="detail-grid">
            <div>{t('match')}: {formatKickoff(item.kickoff, lang)}</div>
            <div>{t('stadium')}: {item.venue || '—'}</div>
            <div>{t('saved')}: {new Date(item.saved_at).toLocaleString(lang === 'en' ? 'en-GB' : 'uk-UA')}</div>
            <div>
              Status: <StatusPill state={rs.state} label={rs.state === 'pending' ? t('pending') : t('successful')} />
            </div>
          </div>
        </section>

        <section className="history-section">
          <h3>{t('prediction')}</h3>
          <div className="detail-grid">
            <div>Result: {predictedResultLabel(item, lang)}</div>
            <div>{t('confidence')}: {(item.confidence * 100).toFixed(1)}%</div>
            <div>Home win probability: {toPercent(p.HomeWin || 0)}</div>
            <div>Draw probability: {toPercent(p.Draw || 0)}</div>
            <div>Away win probability: {toPercent(p.AwayWin || 0)}</div>
          </div>
        </section>

        <section className="history-section">
          <h3>{t('match')} fact</h3>
          {rs.state === 'pending' ? (
            <div className="meta">{t('expected')}</div>
          ) : (
            <div className="detail-grid">
              <div>{t('score')}: {scoreLabel(item)}</div>
              <div>
                Result: <StatusPill state={rs.state} label={rs.state === 'success' ? 'success' : 'fail'} />
              </div>
            </div>
          )}
        </section>

        <section className="history-section">
          <h3>{t('bookmaker')} / {t('value')}</h3>
          {!hasBook ? (
            <div className="meta">Odds unavailable.</div>
          ) : (
            <div className="detail-grid">
              <div>
                Odds: H {item.odds_home} / D {item.odds_draw} / A {item.odds_away}
              </div>
              <div>
                Implied: H {toPercent(implied?.HomeWin || 0)} / D {toPercent(implied?.Draw || 0)} / A {toPercent(implied?.AwayWin || 0)}
              </div>
              <div className={item.value_edge >= 0 ? 'value-box value-good' : 'value-box value-bad'}>
                {item.value_edge >= 0 ? 'Value bet' : 'No value'}: {item.value_edge >= 0 ? '+' : ''}
                {((item.value_edge || 0) * 100).toFixed(1)}%
              </div>
            </div>
          )}
        </section>

        <section className="history-section">
          <h3>Explainability</h3>
          {modelExplain.length === 0 ? (
            <div className="meta">Additional explainability info is not available for this item yet.</div>
          ) : (
            <ul className="req-list">
              {modelExplain.map((line, idx) => (
                <li key={idx} className="req-ok">
                  • {line}
                </li>
              ))}
            </ul>
          )}
          <div className="meta">Elo/form/rolling stats and last 5 matches will appear automatically once these fields are available.</div>
        </section>
      </div>
    </div>
  )
}

export default function HistoryPage({ user, historyItems, onBackHome, onLogout, onGoAnalytics, onGoProfile, lang, t }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState('saved_desc')
  const [selected, setSelected] = useState(null)

  const enriched = useMemo(
    () =>
      historyItems.map((item) => {
        const rs = resultStatus(item, lang)
        return { ...item, _rs: rs }
      }),
    [historyItems, lang]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let arr = enriched.filter((item) => {
      if (filter === 'correct' && item._rs.state !== 'success') return false
      if (filter === 'incorrect' && item._rs.state !== 'fail') return false
      if (filter === 'pending' && item._rs.state !== 'pending') return false
      if (q) {
        const text = `${item.home_team} ${item.away_team}`.toLowerCase()
        if (!text.includes(q)) return false
      }
      return true
    })

    arr = [...arr].sort((a, b) => {
      if (sortBy === 'saved_asc') return new Date(a.saved_at) - new Date(b.saved_at)
      if (sortBy === 'confidence_desc') return (b.confidence || 0) - (a.confidence || 0)
      if (sortBy === 'value_desc') return (b.value_edge || 0) - (a.value_edge || 0)
      return new Date(b.saved_at) - new Date(a.saved_at)
    })

    return arr
  }, [enriched, filter, query, sortBy])

  const summary = useMemo(() => {
    const total = enriched.length
    const success = enriched.filter((i) => i._rs.state === 'success').length
    const fail = enriched.filter((i) => i._rs.state === 'fail').length
    const pending = enriched.filter((i) => i._rs.state === 'pending').length
    const finished = success + fail
    const avgConfidence = total ? (enriched.reduce((s, i) => s + (i.confidence || 0), 0) / total) * 100 : 0
    const accuracy = finished ? (success / finished) * 100 : 0
    const roi = total ? (enriched.reduce((s, i) => s + (i.value_edge || 0), 0) / total) * 100 : 0
    return [
      metric(total, t('total_predictions')),
      metric(`${accuracy.toFixed(1)}%`, t('accuracy')),
      metric(success, t('successful')),
      metric(fail, t('failed')),
      metric(pending, t('pending')),
      metric(`${avgConfidence.toFixed(1)}%`, t('avg_confidence')),
      metric(`${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`, t('roi_proxy')),
    ]
  }, [enriched, t])

  return (
    <main className="page view">
      <header className="topbar">
        <div>
          <p className="eyebrow">Prediction Journal</p>
          <h1>{t('history_title')}</h1>
          <p className="hero-text">{t('history_subtitle', { name: user?.name || user?.email })}</p>
        </div>
        <div className="topbar-actions">
          <button className="secondary" onClick={onGoProfile}>
            {t('profile')}
          </button>
          <button className="secondary" onClick={onGoAnalytics}>
            {t('dashboard')}
          </button>
          <button className="secondary" onClick={onBackHome}>
            {t('to_home')}
          </button>
          <button className="ghost" onClick={onLogout}>
            {t('logout')}
          </button>
        </div>
      </header>

      <section className="summary-grid">
        {summary.map((s) => (
          <article className="summary-card" key={s.label}>
            <div className="summary-value">{s.value}</div>
            <div className="summary-label">{s.label}</div>
          </article>
        ))}
      </section>

      <section className="history-filters">
        <div className="filter-group">
          {['all', 'correct', 'incorrect', 'pending'].map((f) => (
            <button key={f} className={filter === f ? 'chip chip-active' : 'chip'} onClick={() => setFilter(f)}>
              {t(f)}
            </button>
          ))}
        </div>
        <input className="search-input" placeholder={t('search_team')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="saved_desc">{t('newest_first')}</option>
          <option value="saved_asc">{t('oldest_first')}</option>
          <option value="confidence_desc">{t('confidence')}</option>
          <option value="value_desc">{t('value_desc')}</option>
        </select>
      </section>

      {filtered.length === 0 && <div className="empty">{t('nothing_found')}</div>}

      <section className="grid">
        {filtered.map((item) => (
          <article className="card history-card" key={item.id} onClick={() => setSelected(item)} role="button" tabIndex={0}>
            <div className="history-card-top">
              <div className="teams">
                {item.home_team} vs {item.away_team}
              </div>
              <StatusPill state={item._rs.state} label={item._rs.label} />
            </div>
            <div className="meta">{t('match')}: {formatKickoff(item.kickoff, lang)}</div>
            <div className="meta">{t('saved')}: {new Date(item.saved_at).toLocaleString(lang === 'en' ? 'en-GB' : 'uk-UA')}</div>
            <div className="prediction compact">
              <div className="winner">{predictedResultLabel(item, lang)}</div>
              <div>{t('confidence')}: {(item.confidence * 100).toFixed(1)}%</div>
              <div>{probabilitiesLine(item.probabilities)}</div>
              <div className="meta">
                {item._rs.state === 'pending' ? t('expected') : `${t('score')}: ${scoreLabel(item)}`}
              </div>
              {item.value_edge !== null && item.value_edge !== undefined && (
                <div className={item.value_edge >= 0 ? 'value-box value-good' : 'value-box value-bad'}>
                  {t('value')}: {item.value_edge >= 0 ? '+' : ''}
                  {(item.value_edge * 100).toFixed(1)}%
                </div>
              )}
            </div>
          </article>
        ))}
      </section>

      {selected && <DetailsModal item={selected} onClose={() => setSelected(null)} t={t} lang={lang} />}
    </main>
  )
}
