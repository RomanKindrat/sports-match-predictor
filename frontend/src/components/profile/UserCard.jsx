import React, { useMemo, useState } from 'react'

function formatJoinedAt(value, lang) {
  const ts = Date.parse(value || '')
  if (!Number.isFinite(ts)) return '—'
  return new Date(ts).toLocaleString(lang === 'en' ? 'en-GB' : 'uk-UA')
}

export default function UserCard({ user, onSaveName, saving, t, lang }) {
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState(user?.name || '')
  const [error, setError] = useState('')

  const canSave = useMemo(() => nameDraft.trim().length >= 2 && nameDraft.trim() !== (user?.name || ''), [nameDraft, user?.name])

  async function handleSave() {
    if (!canSave) return
    setError('')
    try {
      await onSaveName(nameDraft.trim())
      setEditing(false)
    } catch (err) {
      setError(String(err?.message || 'Failed to update name'))
    }
  }

  return (
    <article className="profile-panel">
      <div className="profile-panel-head">
        <h3>{t('account_info')}</h3>
        {!editing ? (
          <button className="secondary" onClick={() => setEditing(true)}>
            {t('edit_name')}
          </button>
        ) : (
          <div className="inline-actions">
            <button className="secondary" onClick={() => setEditing(false)} disabled={saving}>
              {t('cancel')}
            </button>
            <button className="cta" onClick={handleSave} disabled={!canSave || saving}>
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        )}
      </div>

      <div className="profile-user-grid">
        <div>
          <div className="profile-label">{t('name')}</div>
          {!editing ? (
            <div className="profile-value">{user?.name || '—'}</div>
          ) : (
            <input className="search-input" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
          )}
        </div>
        <div>
          <div className="profile-label">{t('email')}</div>
          <div className="profile-value">{user?.email || '—'}</div>
        </div>
        <div>
          <div className="profile-label">{t('registration_date')}</div>
          <div className="profile-value">{formatJoinedAt(user?.created_at, lang)}</div>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
    </article>
  )
}
