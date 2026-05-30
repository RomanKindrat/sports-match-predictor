import React, { useMemo, useState } from 'react'
import { resultStatus } from '../utils/history'
import { passwordChecks, strengthLabel } from '../utils/password'
import UserCard from '../components/profile/UserCard'
import StatsCards from '../components/profile/StatsCards'
import RecentPredictions from '../components/profile/RecentPredictions'

export default function ProfilePage({
  user,
  historyItems,
  onBackHome,
  onGoHistory,
  onLogout,
  onSaveName,
  onChangePassword,
  savingName,
  changingPassword,
  lang,
  t,
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pwdSuccess, setPwdSuccess] = useState('')

  const stats = useMemo(() => {
    const total = historyItems.length
    const success = historyItems.filter((i) => resultStatus(i, lang).state === 'success').length
    const fail = historyItems.filter((i) => resultStatus(i, lang).state === 'fail').length
    const pending = historyItems.filter((i) => resultStatus(i, lang).state === 'pending').length
    const finished = success + fail
    const accuracy = finished ? (success / finished) * 100 : 0
    const avgConfidence = total ? (historyItems.reduce((s, i) => s + Number(i.confidence || 0), 0) / total) * 100 : 0

    const settledRoi = historyItems
      .map((item) => {
        const rs = resultStatus(item, lang)
        if (rs.state === 'pending') return null
        const odd =
          item.predicted_outcome === 'H' ? Number(item.odds_home) : item.predicted_outcome === 'D' ? Number(item.odds_draw) : Number(item.odds_away)
        if (!Number.isFinite(odd) || odd <= 1) return null
        return rs.state === 'success' ? odd - 1 : -1
      })
      .filter((v) => v != null)

    const roi = settledRoi.length ? (settledRoi.reduce((s, v) => s + v, 0) / settledRoi.length) * 100 : null
    return { total, success, fail, pending, accuracy, avgConfidence, roi }
  }, [historyItems, lang])

  const recentItems = useMemo(() => {
    return [...historyItems].sort((a, b) => Date.parse(b.saved_at || 0) - Date.parse(a.saved_at || 0)).slice(0, 8)
  }, [historyItems])

  const checks = useMemo(() => passwordChecks(newPassword, lang), [newPassword, lang])
  const strength = useMemo(() => strengthLabel(newPassword), [newPassword])
  const canChangePassword = currentPassword && checks.every((c) => c.ok) && newPassword === confirmPassword

  async function submitPassword(e) {
    e.preventDefault()
    setPwdError('')
    setPwdSuccess('')
    if (!canChangePassword) {
      setPwdError(t('check_password_requirements'))
      return
    }
    try {
      await onChangePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_new_password: confirmPassword,
      })
      setPwdSuccess(t('password_updated_login_again'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPwdError(String(err?.message || t('generic_error_update_password')))
    }
  }

  return (
    <main className="page view">
      <header className="topbar">
        <div>
          <p className="eyebrow">{t('account_space')}</p>
          <h1>{t('my_profile')}</h1>
          <p className="hero-text">{t('profile_subtitle')}</p>
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

      <UserCard user={user} onSaveName={onSaveName} saving={savingName} t={t} lang={lang} />

      <StatsCards stats={stats} t={t} />

      <RecentPredictions items={recentItems} onGoHistory={onGoHistory} t={t} lang={lang} />

      <article className="profile-panel">
        <div className="profile-panel-head">
          <h3>{t('account_settings')}</h3>
        </div>

        <form className="profile-password-form" onSubmit={submitPassword}>
          <div className="profile-field">
            <label htmlFor="current-pass">{t('current_password')}</label>
            <input
              id="current-pass"
              type="password"
              className="search-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="profile-field">
            <label htmlFor="new-pass">{t('new_password')}</label>
            <input id="new-pass" type="password" className="search-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <div className={`pwd-strength ${strength}`}>
              {t('strength_label')}: {t(strength)}
            </div>
            <ul className="req-list">
              {checks.map((check) => (
                <li key={check.id} className={check.ok ? 'req-ok' : 'req-pending'}>
                  {check.ok ? '✓' : '•'} {check.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="profile-field">
            <label htmlFor="confirm-pass">{t('confirm_new_password')}</label>
            <input
              id="confirm-pass"
              type="password"
              className="search-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {confirmPassword ? (
              <div className={newPassword === confirmPassword ? 'req-ok' : 'req-pending'}>
                {newPassword === confirmPassword ? `✓ ${t('passwords_match')}` : `• ${t('passwords_no_match')}`}
              </div>
            ) : null}
          </div>
          <div className="profile-settings-actions">
            <button type="submit" className="cta" disabled={!canChangePassword || changingPassword}>
              {changingPassword ? t('updating') : t('update_password')}
            </button>
            <button type="button" className="ghost" onClick={onLogout}>
              {t('logout')}
            </button>
          </div>
          {pwdError ? <div className="error">{pwdError}</div> : null}
          {pwdSuccess ? <div className="req-ok">{pwdSuccess}</div> : null}
        </form>
      </article>
    </main>
  )
}
