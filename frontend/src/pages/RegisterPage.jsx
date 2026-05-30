import React from 'react'
import AuthLayout from '../components/AuthLayout'

export default function RegisterPage({
  authError,
  authSuccess,
  onSubmit,
  authLoading,
  name,
  setName,
  nameValid,
  registerEmail,
  setRegisterEmail,
  emailValid,
  registerPassword,
  setRegisterPassword,
  showPassword,
  setShowPassword,
  passwordStrength,
  passChecks,
  confirmPassword,
  setConfirmPassword,
  showConfirmPassword,
  setShowConfirmPassword,
  passwordsMatch,
  canRegister,
  goLogin,
  t,
}) {
  return (
    <AuthLayout title={t('register_title')} subtitle={t('register_subtitle')} eyebrow={t('auth_account')}>
      {authError && <div className="auth-error">{t('error_prefix')}: {authError}</div>}
      {authSuccess && <div className="auth-success">{authSuccess}</div>}

      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          {t('name')}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('name')} />
          <span className={nameValid ? 'valid' : 'invalid'}>{nameValid ? t('looks_good') : t('min_2_chars')}</span>
        </label>
        <label>
          {t('email')}
          <input type="email" value={registerEmail} onChange={(e) => setRegisterEmail(e.target.value)} placeholder={t('email')} />
          <span className={emailValid ? 'valid' : 'invalid'}>{emailValid ? t('valid_email') : t('invalid_email')}</span>
        </label>
        <label>
          {t('password')}
          <div className="input-with-btn">
            <input
              type={showPassword ? 'text' : 'password'}
              value={registerPassword}
              onChange={(e) => setRegisterPassword(e.target.value)}
              placeholder={t('min_8_chars')}
            />
            <button type="button" className="mini" onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? t('hide') : t('show')}
            </button>
          </div>
          <div className={`strength ${passwordStrength}`}>
            {t('strength_label')}: {t(passwordStrength)}
          </div>
          <ul className="req-list">
            {passChecks.map((item) => (
              <li key={item.id} className={item.ok ? 'req-ok' : 'req-pending'}>
                {item.ok ? '✓' : '•'} {item.label}
              </li>
            ))}
          </ul>
        </label>
        <label>
          {t('confirm_password')}
          <div className="input-with-btn">
            <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            <button type="button" className="mini" onClick={() => setShowConfirmPassword((v) => !v)}>
              {showConfirmPassword ? t('hide') : t('show')}
            </button>
          </div>
          <span className={passwordsMatch ? 'valid' : 'invalid'}>{passwordsMatch ? t('passwords_match') : t('passwords_no_match')}</span>
        </label>

        <button className="auth-btn" disabled={!canRegister || authLoading}>
          {authLoading ? t('creating') : t('sign_up')}
        </button>
      </form>

      <p className="auth-switch">
        {t('has_account')}{' '}
        <button type="button" className="link-btn" onClick={goLogin}>
          {t('sign_in')}
        </button>
      </p>
    </AuthLayout>
  )
}
