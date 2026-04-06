import React from 'react'
import { formatKickoff } from '../../utils/format'
import { predictedResultLabel, resultStatus, scoreLabel } from '../../utils/history'

export default function RecentPredictions({ items, onGoHistory, t, lang }) {
  return (
    <article className="profile-panel">
      <div className="profile-panel-head">
        <h3>{t('recent_predictions')}</h3>
        <button className="secondary" onClick={onGoHistory}>
          {t('go_to_history')}
        </button>
      </div>

      {!items.length ? (
        <div className="empty">{t('no_predictions_yet')}</div>
      ) : (
        <div className="profile-recent-list">
          {items.map((item) => {
            const rs = resultStatus(item, lang)
            return (
              <div key={item.id} className="profile-recent-row">
                <div>
                  <div className="teams">
                    {item.home_team} vs {item.away_team}
                  </div>
                  <div className="meta">{t('match')}: {formatKickoff(item.kickoff, lang)}</div>
                  <div className="meta">{t('prediction')}: {predictedResultLabel(item, lang)}</div>
                </div>
                <div className="profile-recent-right">
                  <span className={`status-pill ${rs.state}`}>{rs.state === 'pending' ? 'pending' : rs.state}</span>
                  <div className="meta">{rs.state === 'pending' ? t('expected') : `${t('score')}: ${scoreLabel(item)}`}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </article>
  )
}
