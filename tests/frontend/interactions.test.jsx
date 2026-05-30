/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import OtpInput from '../../frontend/src/components/OtpInput.jsx'
import AnalyticsFilters from '../../frontend/src/components/analytics/Filters.jsx'
import UserCard from '../../frontend/src/components/profile/UserCard.jsx'
import HistoryPage from '../../frontend/src/pages/HistoryPage.jsx'
import LoginPage from '../../frontend/src/pages/LoginPage.jsx'
import ProfilePage from '../../frontend/src/pages/ProfilePage.jsx'
import RegisterPage from '../../frontend/src/pages/RegisterPage.jsx'
import VerifyPage from '../../frontend/src/pages/VerifyPage.jsx'
import { createT } from '../../frontend/src/i18n.js'

const t = createT('uk')
const user = { name: 'Roman', email: 'roman@example.com', created_at: '2026-05-01T10:00:00Z' }
const noop = vi.fn()

const historyItem = {
  id: 1,
  home_team: 'Arsenal',
  away_team: 'Chelsea',
  kickoff: '2026-05-01T18:00:00Z',
  saved_at: '2026-05-01T20:00:00Z',
  venue: 'Emirates',
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

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('interactive frontend behavior', () => {
  test('OtpInput handles typed digits and pasted code', () => {
    const onChange = vi.fn()
    const { container } = render(<OtpInput value="" onChange={onChange} />)
    const inputs = container.querySelectorAll('input')

    fireEvent.change(inputs[0], { target: { value: 'a5' } })
    expect(onChange).toHaveBeenLastCalledWith('5')

    const preventDefault = vi.fn()
    fireEvent.paste(container.querySelector('.otp-row'), {
      clipboardData: { getData: () => '12a3456' },
      preventDefault,
    })
    expect(onChange).toHaveBeenLastCalledWith('123456')

    fireEvent.keyDown(inputs[1], { key: 'ArrowLeft' })
    fireEvent.keyDown(inputs[1], { key: 'ArrowRight' })
    fireEvent.keyDown(inputs[1], { key: 'Backspace' })
  })

  test('AnalyticsFilters calls callbacks on user actions', () => {
    const onDateRange = vi.fn()
    const onTeamQuery = vi.fn()
    const onStatusFilter = vi.fn()
    const onValueOnly = vi.fn()

    render(
      <AnalyticsFilters
        dateRange="30d"
        onDateRange={onDateRange}
        teamQuery=""
        onTeamQuery={onTeamQuery}
        statusFilter="all"
        onStatusFilter={onStatusFilter}
        valueOnly={false}
        onValueOnly={onValueOnly}
        t={t}
      />
    )

    fireEvent.click(screen.getByText('7 днів'))
    fireEvent.change(screen.getByPlaceholderText('Команда...'), { target: { value: 'Arsenal' } })
    fireEvent.change(screen.getByDisplayValue('Усі статуси'), { target: { value: 'correct' } })
    fireEvent.click(screen.getByLabelText('Лише матчі з великою перевагою'))

    expect(onDateRange).toHaveBeenCalledWith('7d')
    expect(onTeamQuery).toHaveBeenCalledWith('Arsenal')
    expect(onStatusFilter).toHaveBeenCalledWith('correct')
    expect(onValueOnly).toHaveBeenCalledWith(true)
  })

  test('UserCard edits and saves user name', async () => {
    const onSaveName = vi.fn().mockResolvedValue(undefined)
    render(<UserCard user={user} onSaveName={onSaveName} saving={false} t={t} lang="uk" />)

    fireEvent.click(screen.getByText('Змінити імʼя'))
    fireEvent.change(screen.getByDisplayValue('Roman'), { target: { value: 'Roman K' } })
    fireEvent.click(screen.getByText('Зберегти'))

    await waitFor(() => expect(onSaveName).toHaveBeenCalledWith('Roman K'))
  })

  test('LoginPage propagates field changes and password toggle', () => {
    const setLoginEmail = vi.fn()
    const setLoginPassword = vi.fn()
    const setShowLoginPassword = vi.fn()

    const { container } = render(
      <LoginPage
        authError=""
        authSuccess=""
        onSubmit={noop}
        authLoading={false}
        loginEmail=""
        setLoginEmail={setLoginEmail}
        loginPassword=""
        setLoginPassword={setLoginPassword}
        showLoginPassword={false}
        setShowLoginPassword={setShowLoginPassword}
        goRegister={noop}
        t={t}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('Електронна пошта'), { target: { value: 'roman@example.com' } })
    fireEvent.change(container.querySelector('input[type="password"]'), { target: { value: 'Passw0rd!' } })
    fireEvent.click(screen.getByText('Показати'))
    fireEvent.click(screen.getByText('Зареєструватися'))

    expect(setLoginEmail).toHaveBeenCalledWith('roman@example.com')
    expect(setLoginPassword).toHaveBeenCalledWith('Passw0rd!')
    expect(setShowLoginPassword).toHaveBeenCalled()
    expect(noop).toHaveBeenCalled()
  })

  test('RegisterPage propagates field changes and navigation', () => {
    const setName = vi.fn()
    const setRegisterEmail = vi.fn()
    const setRegisterPassword = vi.fn()
    const setConfirmPassword = vi.fn()
    const setShowPassword = vi.fn()
    const setShowConfirmPassword = vi.fn()
    const goLogin = vi.fn()

    const { container } = render(
      <RegisterPage
        authError=""
        authSuccess=""
        onSubmit={noop}
        authLoading={false}
        name=""
        setName={setName}
        nameValid={false}
        registerEmail=""
        setRegisterEmail={setRegisterEmail}
        emailValid={false}
        registerPassword=""
        setRegisterPassword={setRegisterPassword}
        showPassword={false}
        setShowPassword={setShowPassword}
        passwordStrength="weak"
        passChecks={[{ id: 'len', label: 'Мінімум 8 символів', ok: false }]}
        confirmPassword=""
        setConfirmPassword={setConfirmPassword}
        showConfirmPassword={false}
        setShowConfirmPassword={setShowConfirmPassword}
        passwordsMatch={false}
        canRegister={false}
        goLogin={goLogin}
        t={t}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('Імʼя'), { target: { value: 'Roman' } })
    fireEvent.change(screen.getByPlaceholderText('Електронна пошта'), { target: { value: 'roman@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Мінімум 8 символів'), { target: { value: 'Passw0rd!' } })
    fireEvent.change(container.querySelectorAll('input[type="password"]')[1], { target: { value: 'Passw0rd!' } })
    fireEvent.click(screen.getAllByText('Показати')[0])
    fireEvent.click(screen.getByText('Увійти'))

    expect(setName).toHaveBeenCalledWith('Roman')
    expect(setRegisterEmail).toHaveBeenCalledWith('roman@example.com')
    expect(setRegisterPassword).toHaveBeenCalledWith('Passw0rd!')
    expect(setConfirmPassword).toHaveBeenCalledWith('Passw0rd!')
    expect(setShowPassword).toHaveBeenCalled()
    expect(goLogin).toHaveBeenCalled()
  })

  test('VerifyPage allows resending code when timer is inactive', () => {
    const onResend = vi.fn()
    render(
      <VerifyPage
        authError=""
        authSuccess=""
        onSubmit={noop}
        authLoading={false}
        verifyEmail="roman@example.com"
        otp="123456"
        setOtp={noop}
        resendCounter={0}
        onResend={onResend}
        goLogin={noop}
        t={t}
      />
    )

    fireEvent.click(screen.getByText('Надіслати код повторно'))
    expect(onResend).toHaveBeenCalled()
  })

  test('HistoryPage opens prediction details modal', () => {
    render(
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

    fireEvent.click(screen.getByRole('button', { name: /Arsenal/ }))
    expect(screen.getByText('Факт матчу')).toBeTruthy()
    expect(screen.getByText(/Коефіцієнти/)).toBeTruthy()
  })

  test('ProfilePage validates and submits password change', async () => {
    const onChangePassword = vi.fn().mockResolvedValue(undefined)
    const { container } = render(
      <ProfilePage
        user={user}
        historyItems={[historyItem]}
        onBackHome={noop}
        onGoHistory={noop}
        onLogout={noop}
        onSaveName={noop}
        onChangePassword={onChangePassword}
        savingName={false}
        changingPassword={false}
        lang="uk"
        t={t}
      />
    )

    fireEvent.change(container.querySelector('#current-pass'), { target: { value: 'Oldpass1!' } })
    fireEvent.change(container.querySelector('#new-pass'), { target: { value: 'Newpass1!' } })
    fireEvent.change(container.querySelector('#confirm-pass'), { target: { value: 'Newpass1!' } })
    fireEvent.submit(container.querySelector('.profile-password-form'))

    await waitFor(() =>
      expect(onChangePassword).toHaveBeenCalledWith({
        current_password: 'Oldpass1!',
        new_password: 'Newpass1!',
        confirm_new_password: 'Newpass1!',
      })
    )
  })
})
