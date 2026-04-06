import React from 'react'
import AuthLayout from '../components/AuthLayout'
import OtpInput from '../components/OtpInput'

export default function VerifyPage({
  authError,
  authSuccess,
  onSubmit,
  authLoading,
  verifyEmail,
  otp,
  setOtp,
  resendCounter,
  onResend,
  goLogin,
  t,
}) {
  return (
    <AuthLayout title={t('verify_title')} subtitle={t('verify_subtitle')} eyebrow={t('auth_account')}>
      {authError && <div className="auth-error">{t('error_prefix')}: {authError}</div>}
      {authSuccess && <div className="auth-success">{authSuccess}</div>}

      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          {t('email')}
          <input type="email" value={verifyEmail} readOnly aria-readonly="true" className="readonly-input" />
        </label>

        <OtpInput value={otp} onChange={setOtp} />

        <button className="auth-btn" disabled={otp.length !== 6 || authLoading}>
          {authLoading ? t('verifying') : t('confirm')}
        </button>
      </form>

      <div className="resend-row">
        <button className="ghost" disabled={resendCounter > 0 || authLoading} onClick={onResend}>
          {resendCounter > 0 ? t('resend_in', { s: resendCounter }) : t('resend_code')}
        </button>
      </div>

      <p className="auth-switch">
        {t('back_to_login')}{' '}
        <button type="button" className="link-btn" onClick={goLogin}>
          {t('sign_in')}
        </button>
      </p>
    </AuthLayout>
  )
}
