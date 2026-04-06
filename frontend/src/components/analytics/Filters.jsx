import React from 'react'

export default function AnalyticsFilters({
  dateRange,
  onDateRange,
  teamQuery,
  onTeamQuery,
  statusFilter,
  onStatusFilter,
  valueOnly,
  onValueOnly,
  t,
}) {
  return (
    <section className="analytics-filters">
      <div className="filter-group">
        {[
          ['7d', t('days_7')],
          ['30d', t('days_30')],
          ['all', t('all_time')],
        ].map(([key, label]) => (
          <button key={key} className={dateRange === key ? 'chip chip-active' : 'chip'} onClick={() => onDateRange(key)}>
            {label}
          </button>
        ))}
      </div>

      <input className="search-input" placeholder={t('team_placeholder')} value={teamQuery} onChange={(e) => onTeamQuery(e.target.value)} />

      <select className="sort-select" value={statusFilter} onChange={(e) => onStatusFilter(e.target.value)}>
        <option value="all">{t('all_statuses')}</option>
        <option value="correct">{t('correct')}</option>
        <option value="incorrect">{t('incorrect')}</option>
        <option value="pending">{t('pending')}</option>
      </select>

      <label className="analytics-checkbox">
        <input type="checkbox" checked={valueOnly} onChange={(e) => onValueOnly(e.target.checked)} />
        {t('only_value_bets')}
      </label>
    </section>
  )
}
