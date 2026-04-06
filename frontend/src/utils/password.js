export function strengthLabel(password) {
  if (!password) return 'weak'
  let score = 0
  if (password.length >= 8) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/[a-z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  if (score <= 2) return 'weak'
  if (score <= 4) return 'medium'
  return 'strong'
}

export function isStrongEnough(password) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  )
}

export function passwordChecks(password, lang = 'uk') {
  const ru = {
    len: lang === 'en' ? 'Minimum 8 characters' : 'Мінімум 8 символів',
    upper: lang === 'en' ? 'At least one uppercase letter (A-Z)' : 'Є велика літера (A-Z)',
    lower: lang === 'en' ? 'At least one lowercase letter (a-z)' : 'Є мала літера (a-z)',
    digit: lang === 'en' ? 'At least one digit (0-9)' : 'Є цифра (0-9)',
    special: lang === 'en' ? 'At least one special symbol (!@#$...)' : 'Є спецсимвол (!@#$...)',
  }
  return [
    { id: 'len', label: ru.len, ok: password.length >= 8 },
    { id: 'upper', label: ru.upper, ok: /[A-Z]/.test(password) },
    { id: 'lower', label: ru.lower, ok: /[a-z]/.test(password) },
    { id: 'digit', label: ru.digit, ok: /[0-9]/.test(password) },
    { id: 'special', label: ru.special, ok: /[^A-Za-z0-9]/.test(password) },
  ]
}
