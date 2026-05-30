import React, { useEffect, useMemo, useState } from 'react'
import {
  changePassword,
  fetchHistory,
  fetchModelSettings,
  fetchMe,
  fetchPrediction,
  fetchUpcomingMatches,
  loginUser,
  logoutUser,
  registerUser,
  resendCode,
  updateProfileName,
  verifyEmailCode,
} from './api'
import { EMAIL_REGEX, HISTORY_KEY, TOKEN_KEY } from './constants'
import { isFinishedStatus } from './utils/history'
import { isStrongEnough, passwordChecks, strengthLabel } from './utils/password'
import { getPath, navigate } from './utils/router'
import { bookmakerImpliedFromOdds, valueBetStats } from './utils/valueBet'
import { createT } from './i18n'
import HomePage from './pages/HomePage'
import HistoryPage from './pages/HistoryPage'
import AnalyticsPage from './pages/AnalyticsPage'
import ProfilePage from './pages/ProfilePage'
import RegisterPage from './pages/RegisterPage'
import VerifyPage from './pages/VerifyPage'
import LoginPage from './pages/LoginPage'

export default function App() {
  const [pathname, setPathname] = useState(getPath())
  const [token, setToken] = useState('')
  const [me, setMe] = useState(null)
  const [historyItems, setHistoryItems] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [passwordChanging, setPasswordChanging] = useState(false)

  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [predictions, setPredictions] = useState({})
  const [predictLoading, setPredictLoading] = useState({})
  const [activePredictId, setActivePredictId] = useState('')
  const [modelEdgeThreshold, setModelEdgeThreshold] = useState(null)

  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')

  const [name, setName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [verifyEmail, setVerifyEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [resendCounter, setResendCounter] = useState(0)

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const lang = 'uk'
  const t = useMemo(() => createT(lang), [lang])

  const passwordStrength = useMemo(() => strengthLabel(registerPassword), [registerPassword])
  const passChecks = useMemo(() => passwordChecks(registerPassword, lang), [registerPassword, lang])
  const nameValid = name.trim().length >= 2
  const emailValid = EMAIL_REGEX.test(registerEmail.trim())
  const passwordsMatch = registerPassword === confirmPassword
  const passwordValid = isStrongEnough(registerPassword)
  const canRegister = nameValid && emailValid && passwordValid && passwordsMatch

  useEffect(() => {
    const onPopState = () => setPathname(getPath())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (resendCounter <= 0) return
    const timer = setTimeout(() => setResendCounter((v) => v - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCounter])

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY)
    if (!saved) return
    setToken(saved)
    fetchMe(saved)
      .then((user) => {
        setMe(user)
        navigate('/', setPathname)
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY)
        setToken('')
        setMe(null)
        navigate('/login', setPathname)
      })
  }, [])

  useEffect(() => {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const dedup = []
        const seen = new Set()
        const sorted = [...parsed].sort((a, b) => Date.parse(b.saved_at || 0) - Date.parse(a.saved_at || 0))
        for (const item of sorted) {
          const key = String(item.fixture_id || item.id || '')
          if (seen.has(key)) continue
          seen.add(key)
          dedup.push(item)
        }
        setHistoryItems(dedup)
        localStorage.setItem(HISTORY_KEY, JSON.stringify(dedup))
      }
    } catch {
      // ignore broken local storage
    }
  }, [])

  useEffect(() => {
    if (!token || !me) return
    setHistoryLoading(true)
    fetchHistory(token)
      .then((data) => {
        const items = Array.isArray(data?.items) ? data.items : []
        setHistoryItems(items)
        localStorage.setItem(HISTORY_KEY, JSON.stringify(items))
      })
      .catch(() => {
        // keep local history fallback
      })
      .finally(() => setHistoryLoading(false))
  }, [token, me])

  useEffect(() => {
    if ((pathname === '/history' || pathname === '/analytics' || pathname === '/profile') && !me) navigate('/login', setPathname)
  }, [pathname, me])

  useEffect(() => {
    if (pathname === '/' && matches.length === 0) loadMatches()
  }, [pathname, matches.length])

  useEffect(() => {
    fetchModelSettings()
      .then((data) => {
        const threshold = Number(data?.selected_edge_threshold)
        if (Number.isFinite(threshold) && threshold >= 0) {
          setModelEdgeThreshold(threshold)
        }
      })
      .catch(() => {
        // keep frontend fallback when settings endpoint is unavailable
      })
  }, [])

  function clearAuthAlerts() {
    setAuthError('')
    setAuthSuccess('')
  }

  async function loadMatches() {
    setLoading(true)
    setError('')
    setNote('')
    try {
      const data = await fetchUpcomingMatches({ league: 152, limit: 240 })
      setMatches(data.matches || [])
      setNote(data.note || '')
    } catch (e) {
      setMatches([])
      setNote('')
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function onPredict(match) {
    const id = match.fixture_id || `${match.home_team}-${match.away_team}-${match.kickoff}`
    if (activePredictId && activePredictId !== id) return
    setActivePredictId(id)
    setPredictLoading((prev) => ({ ...prev, [id]: true }))
    try {
      const data = await fetchPrediction({
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        fixtureId: match.fixture_id || undefined,
        league: 152,
        kickoff: match.kickoff || undefined,
        timezone: match.timezone || undefined,
        status: match.status || undefined,
        venue: match.venue || undefined,
        oddsHome: match.odds_home ?? undefined,
        oddsDraw: match.odds_draw ?? undefined,
        oddsAway: match.odds_away ?? undefined,
        token: token || undefined,
      })
      setPredictions((prev) => ({ ...prev, [id]: data }))

      const stats = valueBetStats(match, data)
      const book = bookmakerImpliedFromOdds(match)
      const probs = data.probabilities || {}
      const predKey = ['HomeWin', 'Draw', 'AwayWin'].reduce(
        (best, key) => (typeof probs[key] === 'number' && probs[key] > (probs[best] ?? -1) ? key : best),
        'HomeWin'
      )
      const predictedOutcome = predKey === 'HomeWin' ? 'H' : predKey === 'Draw' ? 'D' : 'A'
      const record = {
        id: `${id}-${Date.now()}`,
        fixture_id: match.fixture_id || id,
        home_team: match.home_team,
        away_team: match.away_team,
        kickoff: match.kickoff || null,
        venue: match.venue || null,
        match_status: match.status || null,
        saved_at: new Date().toISOString(),
        predicted_result: data.predicted_result,
        predicted_outcome: predictedOutcome,
        confidence: data.confidence,
        probabilities: probs,
        value_edge: stats ? stats.edge : null,
        odds_home: match.odds_home ?? null,
        odds_draw: match.odds_draw ?? null,
        odds_away: match.odds_away ?? null,
        bookmaker_probs: book,
        final_home_goals: isFinishedStatus(match.status) ? match.home_goals ?? null : null,
        final_away_goals: isFinishedStatus(match.status) ? match.away_goals ?? null : null,
      }
      setHistoryItems((prev) => {
        const nextHistory = [record, ...prev.filter((p) => String(p.fixture_id) !== String(record.fixture_id))].slice(0, 200)
        localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory))
        return nextHistory
      })
    } catch (e) {
      setPredictions((prev) => ({ ...prev, [id]: { error: e.message } }))
    } finally {
      setPredictLoading((prev) => ({ ...prev, [id]: false }))
      setActivePredictId('')
    }
  }

  async function submitRegister(e) {
    e.preventDefault()
    if (!canRegister) return
    clearAuthAlerts()
    setAuthLoading(true)
    try {
      const data = await registerUser({
        name: name.trim(),
        email: registerEmail.trim(),
        password: registerPassword,
        confirm_password: confirmPassword,
      })
      setVerifyEmail(registerEmail.trim())
      setOtp('')
      setResendCounter(60)
      setAuthSuccess(data.dev_code ? t('smtp_dev_code', { code: data.dev_code }) : t('code_sent'))
      navigate('/verify', setPathname)
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setAuthLoading(false)
    }
  }

  async function submitVerify(e) {
    e.preventDefault()
    clearAuthAlerts()
    setAuthLoading(true)
    try {
      await verifyEmailCode({ email: verifyEmail.trim(), code: otp })
      setAuthSuccess(t('email_verified_login'))
      setLoginEmail(verifyEmail.trim())
      navigate('/login', setPathname)
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setAuthLoading(false)
    }
  }

  async function submitResend() {
    clearAuthAlerts()
    setAuthLoading(true)
    try {
      const data = await resendCode({ email: verifyEmail.trim() })
      setResendCounter(60)
      setAuthSuccess(data.dev_code ? t('smtp_dev_code', { code: data.dev_code }) : t('code_resent'))
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setAuthLoading(false)
    }
  }

  async function submitLogin(e) {
    e.preventDefault()
    clearAuthAlerts()
    setAuthLoading(true)
    try {
      const data = await loginUser({ email: loginEmail.trim(), password: loginPassword })
      localStorage.setItem(TOKEN_KEY, data.access_token)
      setToken(data.access_token)
      const user = await fetchMe(data.access_token)
      setMe(user)
      navigate('/', setPathname)
    } catch (err) {
      setAuthError(err.message)
      if (String(err.message).toLowerCase().includes('verify')) {
        setVerifyEmail(loginEmail.trim())
        setOtp('')
        setAuthError(t('verify_pending_redirect'))
        navigate('/verify', setPathname)
      }
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleLogout() {
    try {
      if (token) await logoutUser(token)
    } catch {
      // ignore and logout client side
    } finally {
      localStorage.removeItem(TOKEN_KEY)
      setToken('')
      setMe(null)
      setPredictions({})
      navigate('/login', setPathname)
    }
  }

  async function handleSaveName(nextName) {
    if (!token) throw new Error(t('need_sign_in'))
    setProfileSaving(true)
    try {
      const updated = await updateProfileName(token, { name: nextName })
      setMe(updated)
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleChangePassword(payload) {
    if (!token) throw new Error(t('need_sign_in'))
    setPasswordChanging(true)
    try {
      await changePassword(token, payload)
      await handleLogout()
    } finally {
      setPasswordChanging(false)
    }
  }

  if (pathname === '/') {
    return (
      <HomePage
        user={me}
        onLogout={handleLogout}
        onReload={loadMatches}
        onPredict={onPredict}
        matchesState={{
          matches,
          loading,
          error,
          note,
          predictions,
          predictLoading,
          activePredictId,
          modelEdgeThreshold,
          onGoHistory: () => (me ? navigate('/history', setPathname) : navigate('/login', setPathname)),
          onGoAnalytics: () => (me ? navigate('/analytics', setPathname) : navigate('/login', setPathname)),
          onGoProfile: () => (me ? navigate('/profile', setPathname) : navigate('/login', setPathname)),
        }}
        isGuest={!me}
        onAuthRequired={() => navigate('/login', setPathname)}
        onGoRegister={() => navigate('/register', setPathname)}
        lang={lang}
        t={t}
      />
    )
  }

  if (pathname === '/history' && me) {
    return (
      <HistoryPage
        user={me}
        historyItems={historyItems}
        onBackHome={() => navigate('/', setPathname)}
        onGoAnalytics={() => navigate('/analytics', setPathname)}
        onGoProfile={() => navigate('/profile', setPathname)}
        onLogout={handleLogout}
        lang={lang}
        t={t}
      />
    )
  }

  if (pathname === '/analytics' && me) {
    return (
      <AnalyticsPage
        user={me}
        historyItems={historyItems}
        loadingHistory={historyLoading}
        onBackHome={() => navigate('/', setPathname)}
        onLogout={handleLogout}
        lang={lang}
        t={t}
      />
    )
  }

  if (pathname === '/profile' && me) {
    return (
      <ProfilePage
        user={me}
        historyItems={historyItems}
        onBackHome={() => navigate('/', setPathname)}
        onGoHistory={() => navigate('/history', setPathname)}
        onLogout={handleLogout}
        onSaveName={handleSaveName}
        onChangePassword={handleChangePassword}
        savingName={profileSaving}
        changingPassword={passwordChanging}
        lang={lang}
        t={t}
      />
    )
  }

  if (pathname === '/register') {
    return (
      <RegisterPage
        authError={authError}
        authSuccess={authSuccess}
        onSubmit={submitRegister}
        authLoading={authLoading}
        name={name}
        setName={setName}
        nameValid={nameValid}
        registerEmail={registerEmail}
        setRegisterEmail={setRegisterEmail}
        emailValid={emailValid}
        registerPassword={registerPassword}
        setRegisterPassword={setRegisterPassword}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        passwordStrength={passwordStrength}
        passChecks={passChecks}
        confirmPassword={confirmPassword}
        setConfirmPassword={setConfirmPassword}
        showConfirmPassword={showConfirmPassword}
        setShowConfirmPassword={setShowConfirmPassword}
        passwordsMatch={passwordsMatch}
        canRegister={canRegister}
        goLogin={() => navigate('/login', setPathname)}
        t={t}
      />
    )
  }

  if (pathname === '/verify') {
    return (
      <VerifyPage
        authError={authError}
        authSuccess={authSuccess}
        onSubmit={submitVerify}
        authLoading={authLoading}
        verifyEmail={verifyEmail}
        otp={otp}
        setOtp={setOtp}
        resendCounter={resendCounter}
        onResend={submitResend}
        goLogin={() => navigate('/login', setPathname)}
        t={t}
      />
    )
  }

  return (
    <LoginPage
      authError={authError}
      authSuccess={authSuccess}
      onSubmit={submitLogin}
      authLoading={authLoading}
      loginEmail={loginEmail}
      setLoginEmail={setLoginEmail}
      loginPassword={loginPassword}
      setLoginPassword={setLoginPassword}
      showLoginPassword={showLoginPassword}
      setShowLoginPassword={setShowLoginPassword}
      goRegister={() => navigate('/register', setPathname)}
      t={t}
    />
  )
}
