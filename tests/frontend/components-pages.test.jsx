import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'

import AuthLayout from '../../frontend/src/components/AuthLayout.jsx'
import OtpInput from '../../frontend/src/components/OtpInput.jsx'
import AnalyticsFilters from '../../frontend/src/components/analytics/Filters.jsx'
import MetricCard from '../../frontend/src/components/analytics/MetricCard.jsx'
import ChartsSection from '../../frontend/src/components/analytics/ChartsSection.jsx'
import RecentPredictions from '../../frontend/src/components/profile/RecentPredictions.jsx'
import StatsCards from '../../frontend/src/components/profile/StatsCards.jsx'
import UserCard from '../../frontend/src/components/profile/UserCard.jsx'
import AnalyticsPage from '../../frontend/src/pages/AnalyticsPage.jsx'
import HistoryPage from '../../frontend/src/pages/HistoryPage.jsx'
import HomePage from '../../frontend/src/pages/HomePage.jsx'
import LoginPage from '../../frontend/src/pages/LoginPage.jsx'
import ProfilePage from '../../frontend/src/pages/ProfilePage.jsx'
import RegisterPage from '../../frontend/src/pages/RegisterPage.jsx'
import VerifyPage from '../../frontend/src/pages/VerifyPage.jsx'
import { createT } from '../../frontend/src/i18n.js'

const t = createT('uk')
const noop = vi.fn()

const user = {
  name: 'Roman',
  email: 'roman@example.com',
  created_at: '2026-05-01T10:00:00Z',
}

const match = {
  fixture_id: 101,
  home_team: 'Arsenal',
  away_team: 'Chelsea',
  kickoff: '2026-05-20T18:00:00Z',
  venue: 'Emirates',
  round: 'Regular Season - 38',
  odds_home: 2,
  odds_draw: 4,
  odds_away: 4,
}

const prediction = {
  predicted_result: 'Перемога Arsenal',
  confidence: 0.56,
  probabilities: { HomeWin: 0.56, Draw: 0.22, AwayWin: 0.22 },
  selected_edge_threshold: 0.15,
}

const historyItem = {
  id: 1,
  home_team: 'Arsenal',
  away_team: 'Chelsea',
  kickoff: '2026-05-01T18:00:00Z',
  saved_at: '2026-05-01T20:00:00Z',
  match_status: 'FT',
  final_home_goals: 2,
  final_away_goals: 1,
  predicted_outcome: 'H',
  predicted_result: 'Перемога Arsenal',
  confidence: 0.56,
  probabilities: { HomeWin: 0.56, Draw: 0.22, AwayWin: 0.22 },
  odds_home: 2,
  odds_draw: 4,
  odds_away: 4,
  bookmaker_probs: { HomeWin: 0.5, Draw: 0.25, AwayWin: 0.25 },
  value_edge: 0.06,
}

function html(element) {
  return renderToStaticMarkup(element)
}

describe('shared React components', () => {
  test('AuthLayout renders title, subtitle and children', () => {
    const markup = html(
      <AuthLayout title="Вхід" subtitle="Підзаголовок" eyebrow="Акаунт">
        <button>Дія</button>
      </AuthLayout>
    )

    expect(markup).toContain('Вхід')
    expect(markup).toContain('Підзаголовок')
    expect(markup).toContain('Дія')
  })

  test('OtpInput renders six numeric inputs', () => {
    const markup = html(<OtpInput value="123" onChange={noop} />)

    expect(markup.match(/class="otp-box"/g)).toHaveLength(6)
    expect(markup).toContain('value="1"')
  })

  test('MetricCard optionally renders hint', () => {
    expect(html(<MetricCard title="Точність" value="55%" hint="опис" tone="good" />)).toContain('metric-tone-good')
    expect(html(<MetricCard title="Точність" value="55%" />)).not.toContain('metric-hint')
  })

  test('AnalyticsFilters renders filter controls', () => {
    const markup = html(
      <AnalyticsFilters
        dateRange="30d"
        onDateRange={noop}
        teamQuery="Arsenal"
        onTeamQuery={noop}
        statusFilter="all"
        onStatusFilter={noop}
        valueOnly={false}
        onValueOnly={noop}
        t={t}
      />
    )

    expect(markup).toContain('30 днів')
    expect(markup).toContain('Arsenal')
    expect(markup).toContain('Усі статуси')
  })

  test('StatsCards renders profile metrics including ROI fallback', () => {
    const markup = html(
      <StatsCards
        stats={{ total: 4, accuracy: 50, success: 2, fail: 1, pending: 1, avgConfidence: 62.5, roi: null }}
        t={t}
      />
    )

    expect(markup).toContain('Усього прогнозів')
    expect(markup).toContain('62.5%')
    expect(markup).toContain('—')
  })

  test('RecentPredictions renders empty and filled states', () => {
    expect(html(<RecentPredictions items={[]} onGoHistory={noop} t={t} lang="uk" />)).toContain('Поки немає прогнозів')

    const markup = html(<RecentPredictions items={[historyItem]} onGoHistory={noop} t={t} lang="uk" />)
    expect(markup).toContain('Arsenal')
    expect(markup).toContain('Вгадано')
  })

  test('UserCard renders account information', () => {
    const markup = html(<UserCard user={user} onSaveName={noop} saving={false} t={t} lang="uk" />)

    expect(markup).toContain('Інформація акаунта')
    expect(markup).toContain('roman@example.com')
  })

  test('ChartsSection renders chart titles and empty states', () => {
    const markup = html(
      <ChartsSection
        accuracyTrend={[]}
        roiTrend={[{ label: '01.05', value: 0.1 }]}
        predictionDistribution={[{ label: 'H', value: 1 }]}
        confidenceDistribution={[{ label: '50%', value: 1 }]}
        t={t}
      />
    )

    expect(markup).toContain('Точність у часі')
    expect(markup).toContain('Недостатньо даних')
    expect(markup).toContain('Рентабельність у часі')
  })
})

describe('auth pages', () => {
  test('LoginPage renders form and error/success messages', () => {
    const markup = html(
      <LoginPage
        authError="Bad credentials"
        authSuccess="Welcome"
        onSubmit={noop}
        authLoading={false}
        loginEmail="roman@example.com"
        setLoginEmail={noop}
        loginPassword="secret"
        setLoginPassword={noop}
        showLoginPassword={false}
        setShowLoginPassword={noop}
        goRegister={noop}
        t={t}
      />
    )

    expect(markup).toContain('Вхід в акаунт')
    expect(markup).toContain('Bad credentials')
    expect(markup).toContain('roman@example.com')
  })

  test('RegisterPage renders password requirements and disabled submit state', () => {
    const markup = html(
      <RegisterPage
        authError=""
        authSuccess=""
        onSubmit={noop}
        authLoading={false}
        name="Roman"
        setName={noop}
        nameValid
        registerEmail="roman@example.com"
        setRegisterEmail={noop}
        emailValid
        registerPassword="Passw0rd!"
        setRegisterPassword={noop}
        showPassword={false}
        setShowPassword={noop}
        passwordStrength="strong"
        passChecks={[{ id: 'len', label: 'Мінімум 8 символів', ok: true }]}
        confirmPassword="Passw0rd!"
        setConfirmPassword={noop}
        showConfirmPassword={false}
        setShowConfirmPassword={noop}
        passwordsMatch
        canRegister
        goLogin={noop}
        t={t}
      />
    )

    expect(markup).toContain('Створіть акаунт')
    expect(markup).toContain('Сила пароля')
    expect(markup).toContain('Паролі збігаються')
  })

  test('VerifyPage renders OTP form and resend counter', () => {
    const markup = html(
      <VerifyPage
        authError=""
        authSuccess="Код надіслано"
        onSubmit={noop}
        authLoading={false}
        verifyEmail="roman@example.com"
        otp="123456"
        setOtp={noop}
        resendCounter={20}
        onResend={noop}
        goLogin={noop}
        t={t}
      />
    )

    expect(markup).toContain('Підтвердіть електронну пошту')
    expect(markup).toContain('roman@example.com')
    expect(markup).toContain('Повторно через 20 с')
  })
})

describe('main pages', () => {
  test('HomePage renders guest match list and prediction login action', () => {
    const markup = html(
      <HomePage
        user={null}
        onLogout={noop}
        matchesState={{
          matches: [match],
          loading: false,
          error: '',
          note: '',
          predictions: {},
          predictLoading: {},
          activePredictId: null,
          modelEdgeThreshold: 0.15,
          onGoHistory: noop,
          onGoAnalytics: noop,
          onGoProfile: noop,
        }}
        onReload={noop}
        onPredict={noop}
        isGuest
        onAuthRequired={noop}
        onGoRegister={noop}
        lang="uk"
        t={t}
      />
    )

    expect(markup).toContain('Прогнози матчів АПЛ')
    expect(markup).toContain('Arsenal')
    expect(markup).toContain('Увійти для прогнозу')
  })

  test('HomePage renders prediction details for authorized user', () => {
    const markup = html(
      <HomePage
        user={user}
        onLogout={noop}
        matchesState={{
          matches: [match],
          loading: false,
          error: '',
          note: '',
          predictions: { 101: prediction },
          predictLoading: {},
          activePredictId: null,
          modelEdgeThreshold: 0.15,
          onGoHistory: noop,
          onGoAnalytics: noop,
          onGoProfile: noop,
        }}
        onReload={noop}
        onPredict={noop}
        lang="uk"
        t={t}
      />
    )

    expect(markup).toContain('Перемога Arsenal')
    expect(markup).toContain('Впевненість')
    expect(markup).toContain('Перевага')
  })

  test('HistoryPage renders summary and history card', () => {
    const markup = html(
      <HistoryPage
        user={user}
        historyItems={[historyItem]}
        onBackHome={noop}
        onLogout={noop}
        onGoAnalytics={noop}
        onGoProfile={noop}
        lang="uk"
        t={t}
      />
    )

    expect(markup).toContain('Історія прогнозів')
    expect(markup).toContain('Arsenal')
    expect(markup).toContain('Вгадано')
  })

  test('AnalyticsPage renders metric cards when history is available', () => {
    const markup = html(
      <AnalyticsPage
        user={user}
        historyItems={[historyItem]}
        loadingHistory={false}
        onBackHome={noop}
        onLogout={noop}
        lang="uk"
        t={t}
      />
    )

    expect(markup).toContain('Аналітика')
    expect(markup).toContain('Точність')
    expect(markup).toContain('Модель проти букмекера')
  })

  test('ProfilePage renders account panels and recent predictions', () => {
    const markup = html(
      <ProfilePage
        user={user}
        historyItems={[historyItem]}
        onBackHome={noop}
        onGoHistory={noop}
        onLogout={noop}
        onSaveName={noop}
        onChangePassword={noop}
        savingName={false}
        changingPassword={false}
        lang="uk"
        t={t}
      />
    )

    expect(markup).toContain('Мій профіль')
    expect(markup).toContain('Інформація акаунта')
    expect(markup).toContain('Останні прогнози')
  })
})
