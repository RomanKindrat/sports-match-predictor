import React from 'react'

function metric(value, label) {
  return { value, label }
}

export default function StatsCards({ stats, t }) {
  const cards = [
    metric(stats.total, t('total_predictions')),
    metric(`${stats.accuracy.toFixed(1)}%`, t('accuracy')),
    metric(stats.success, t('guessed')),
    metric(stats.fail, t('not_guessed')),
    metric(stats.pending, t('pending')),
    metric(`${stats.avgConfidence.toFixed(1)}%`, t('average_confidence_title')),
    metric(stats.roi == null ? '—' : `${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}%`, 'ROI'),
  ]

  return (
    <section className="summary-grid">
      {cards.map((s) => (
        <article className="summary-card" key={s.label}>
          <div className="summary-value">{s.value}</div>
          <div className="summary-label">{s.label}</div>
        </article>
      ))}
    </section>
  )
}
