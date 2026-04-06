import React, { useMemo, useState } from 'react'
import MetricCard from '../components/analytics/MetricCard'
import AnalyticsFilters from '../components/analytics/Filters'
import ChartsSection from '../components/analytics/ChartsSection'
import { resultStatus } from '../utils/history'

function pct(value) {
  return `${(value * 100).toFixed(1)}%`
}

function dayLabel(date, lang) {
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'uk-UA', { day: '2-digit', month: '2-digit' })
}

function bookmakerPick(item) {
  const b = item.bookmaker_probs || {}
  const h = Number(b.HomeWin)
  const d = Number(b.Draw)
  const a = Number(b.AwayWin)
  if (![h, d, a].some(Number.isFinite)) return null
  if (h >= d && h >= a) return 'H'
  if (d >= h && d >= a) return 'D'
  return 'A'
}

export default function AnalyticsPage({ user, historyItems, loadingHistory, onBackHome, onLogout, lang, t }) {
  const [dateRange, setDateRange] = useState('30d')
  const [teamQuery, setTeamQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [valueOnly, setValueOnly] = useState(false)

  const filtered = useMemo(() => {
    const now = Date.now()
    const fromTs = dateRange === '7d' ? now - 7 * 86400000 : dateRange === '30d' ? now - 30 * 86400000 : null
    const q = teamQuery.trim().toLowerCase()
    return historyItems.filter((item) => {
      const ts = Date.parse(item.saved_at || '')
      if (fromTs && Number.isFinite(ts) && ts < fromTs) return false
      if (q) {
        const text = `${item.home_team || ''} ${item.away_team || ''}`.toLowerCase()
        if (!text.includes(q)) return false
      }
      const rs = resultStatus(item, lang)
      if (statusFilter === 'correct' && rs.state !== 'success') return false
      if (statusFilter === 'incorrect' && rs.state !== 'fail') return false
      if (statusFilter === 'pending' && rs.state !== 'pending') return false
      if (valueOnly && !(Number(item.value_edge) > 0)) return false
      return true
    })
  }, [historyItems, dateRange, teamQuery, statusFilter, valueOnly, lang])

  const analytics = useMemo(() => {
    const rows = filtered.map((item) => ({ ...item, _rs: resultStatus(item, lang) }))
    const total = rows.length
    const correct = rows.filter((r) => r._rs.state === 'success').length
    const incorrect = rows.filter((r) => r._rs.state === 'fail').length
    const pending = rows.filter((r) => r._rs.state === 'pending').length
    const finished = correct + incorrect
    const accuracy = finished ? correct / finished : 0
    const avgConfidence = total ? rows.reduce((s, r) => s + Number(r.confidence || 0), 0) / total : 0
    const avgValueEdge = total ? rows.reduce((s, r) => s + Number(r.value_edge || 0), 0) / total : 0

    const settledRois = rows
      .map((r) => {
        if (r._rs.state === 'pending') return null
        const odd =
          r.predicted_outcome === 'H' ? Number(r.odds_home) : r.predicted_outcome === 'D' ? Number(r.odds_draw) : Number(r.odds_away)
        if (!Number.isFinite(odd) || odd <= 1) return null
        return r._rs.state === 'success' ? odd - 1 : -1
      })
      .filter((v) => v !== null)
    const roi = settledRois.length ? settledRois.reduce((s, v) => s + v, 0) / settledRois.length : null

    const marketRows = rows.filter((r) => r._rs.state !== 'pending')
    let marketTotal = 0
    let marketCorrect = 0
    marketRows.forEach((r) => {
      const actual = r.final_home_goals > r.final_away_goals ? 'H' : r.final_home_goals < r.final_away_goals ? 'A' : 'D'
      const mPick = bookmakerPick(r)
      if (!mPick) return
      marketTotal += 1
      if (mPick === actual) marketCorrect += 1
    })
    const marketAccuracy = marketTotal ? marketCorrect / marketTotal : 0

    const valueRows = rows.filter((r) => Number(r.value_edge) > 0)
    const valueFinished = valueRows.filter((r) => r._rs.state !== 'pending')
    const valueWins = valueFinished.filter((r) => r._rs.state === 'success').length
    const valueWinrate = valueFinished.length ? valueWins / valueFinished.length : 0

    const byDay = new Map()
    rows.forEach((r) => {
      const key = dayLabel(r.saved_at, lang)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key).push(r)
    })
    const sortedDays = [...byDay.entries()]
    const accuracyTrend = sortedDays.map(([label, group]) => {
      const fin = group.filter((g) => g._rs.state !== 'pending')
      const c = fin.filter((g) => g._rs.state === 'success').length
      return { label, value: fin.length ? c / fin.length : 0 }
    })
    const roiTrend = sortedDays.map(([label, group]) => {
      const rois = group
        .map((r) => {
          if (r._rs.state === 'pending') return null
          const odd =
            r.predicted_outcome === 'H' ? Number(r.odds_home) : r.predicted_outcome === 'D' ? Number(r.odds_draw) : Number(r.odds_away)
          if (!Number.isFinite(odd) || odd <= 1) return null
          return r._rs.state === 'success' ? odd - 1 : -1
        })
        .filter((v) => v !== null)
      return { label, value: rois.length ? rois.reduce((s, v) => s + v, 0) / rois.length : 0 }
    })

    const distPred = [
      { label: t('home'), value: rows.filter((r) => r.predicted_outcome === 'H').length },
      { label: t('draw'), value: rows.filter((r) => r.predicted_outcome === 'D').length },
      { label: t('away'), value: rows.filter((r) => r.predicted_outcome === 'A').length },
    ]

    const bins = [
      { label: '<40%', min: 0, max: 0.4 },
      { label: '40-55%', min: 0.4, max: 0.55 },
      { label: '55-70%', min: 0.55, max: 0.7 },
      { label: '>70%', min: 0.7, max: 1.01 },
    ]
    const confDist = bins.map((b) => ({
      label: b.label,
      value: rows.filter((r) => {
        const c = Number(r.confidence || 0)
        return c >= b.min && c < b.max
      }).length,
    }))

    return {
      total,
      correct,
      incorrect,
      pending,
      accuracy,
      avgConfidence,
      roi,
      avgValueEdge,
      marketAccuracy,
      marketDiff: accuracy - marketAccuracy,
      valueCount: valueRows.length,
      valueWins,
      valueWinrate,
      accuracyTrend,
      roiTrend,
      distPred,
      confDist,
    }
  }, [filtered, lang, t])

  const cards = [
    { title: t('accuracy'), value: pct(analytics.accuracy), hint: 'correct / finished', tone: analytics.accuracy >= 0.5 ? 'good' : 'bad' },
    { title: t('total_predictions'), value: analytics.total, hint: t('all_records'), tone: 'neutral' },
    { title: t('correct_predictions_title'), value: analytics.correct, hint: t('successful_hint'), tone: 'good' },
    { title: t('incorrect_predictions_title'), value: analytics.incorrect, hint: t('failed_hint'), tone: 'bad' },
    { title: t('pending_predictions_title'), value: analytics.pending, hint: t('pending_hint'), tone: 'neutral' },
    { title: t('average_confidence_title'), value: pct(analytics.avgConfidence), hint: t('average_confidence_hint'), tone: 'neutral' },
    { title: 'ROI', value: analytics.roi == null ? '—' : pct(analytics.roi), hint: t('roi_settled_hint'), tone: (analytics.roi ?? 0) >= 0 ? 'good' : 'bad' },
    { title: t('average_value_edge_title'), value: `${analytics.avgValueEdge >= 0 ? '+' : ''}${pct(analytics.avgValueEdge)}`, hint: t('model_market_hint'), tone: analytics.avgValueEdge >= 0 ? 'good' : 'bad' },
    { title: t('bookmaker_accuracy_title'), value: pct(analytics.marketAccuracy), hint: t('market_hint'), tone: 'neutral' },
    { title: t('model_vs_book_title'), value: `${analytics.marketDiff >= 0 ? '+' : ''}${pct(analytics.marketDiff)}`, hint: t('model_book_diff_hint'), tone: analytics.marketDiff >= 0 ? 'good' : 'bad' },
    { title: t('value_bets_title'), value: analytics.valueCount, hint: t('edge_gt_zero'), tone: 'neutral' },
    { title: t('value_winrate'), value: pct(analytics.valueWinrate), hint: `${analytics.valueWins}/${Math.max(1, analytics.valueCount)}`, tone: analytics.valueWinrate >= 0.5 ? 'good' : 'bad' },
  ]

  return (
    <main className="page view">
      <header className="topbar">
        <div>
          <p className="eyebrow">Model Intelligence</p>
          <h1>{t('analytics_title')}</h1>
          <p className="hero-text">{t('analytics_subtitle', { name: user?.name || user?.email })}</p>
        </div>
        <div className="topbar-actions">
          <button className="secondary" onClick={onBackHome}>
            {t('to_home')}
          </button>
          <button className="ghost" onClick={onLogout}>
            {t('logout')}
          </button>
        </div>
      </header>

      <AnalyticsFilters
        dateRange={dateRange}
        onDateRange={setDateRange}
        teamQuery={teamQuery}
        onTeamQuery={setTeamQuery}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        valueOnly={valueOnly}
        onValueOnly={setValueOnly}
        t={t}
      />

      {loadingHistory ? <div className="empty">{t('loading_analytics')}</div> : null}
      {!loadingHistory && filtered.length === 0 ? <div className="empty">{t('no_analytics_data')}</div> : null}

      {!loadingHistory && filtered.length > 0 ? (
        <>
          <section className="summary-grid">
            {cards.map((card) => (
              <MetricCard key={card.title} title={card.title} value={card.value} hint={card.hint} tone={card.tone} />
            ))}
          </section>

          <ChartsSection
            accuracyTrend={analytics.accuracyTrend}
            roiTrend={analytics.roiTrend}
            predictionDistribution={analytics.distPred}
            confidenceDistribution={analytics.confDist}
            t={t}
          />
        </>
      ) : null}
    </main>
  )
}
