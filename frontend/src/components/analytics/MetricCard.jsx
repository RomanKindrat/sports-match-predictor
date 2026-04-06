import React from 'react'

export default function MetricCard({ title, value, hint, tone = 'neutral' }) {
  return (
    <article className={`summary-card metric-tone-${tone}`}>
      <div className="summary-label">{title}</div>
      <div className="summary-value">{value}</div>
      {hint ? <div className="metric-hint">{hint}</div> : null}
    </article>
  )
}
