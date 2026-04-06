import React from 'react'
import AuthLayout from '../components/AuthLayout'

export default function LoginPage({
  authError,
  authSuccess,
  onSubmit,
  authLoading,
  loginEmail,
  setLoginEmail,
  loginPassword,
  setLoginPassword,
  showLoginPassword,
  setShowLoginPassword,
  goRegister,
  t,
}) {
  return (
    <AuthLayout title={t('login_title')} subtitle={t('login_subtitle')} eyebrow={t('auth_account')}>
      {authError && <div className="auth-error">{t('error_prefix')}: {authError}</div>}
      {authSuccess && <div className="auth-success">{authSuccess}</div>}

      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          {t('email')}
          <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder={t('email')} />
        </label>
        <label>
          {t('password')}
          <div className="input-with-btn">
            <input type={showLoginPassword ? 'text' : 'password'} value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
            <button type="button" className="mini" onClick={() => setShowLoginPassword((v) => !v)}>
              {showLoginPassword ? t('hide') : t('show')}
            </button>
          </div>
        </label>
        <button className="auth-btn" disabled={authLoading}>
          {authLoading ? t('logging_in') : t('login')}
        </button>
      </form>

      <p className="auth-switch">
        {t('no_account')}{' '}
        <button type="button" className="link-btn" onClick={goRegister}>
          {t('sign_up')}
        </button>
      </p>
    </AuthLayout>
  )
}
