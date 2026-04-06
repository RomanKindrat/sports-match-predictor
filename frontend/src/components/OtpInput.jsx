import React, { useRef } from 'react'

export default function OtpInput({ value, onChange }) {
  const refs = useRef([])
  const digits = value.padEnd(6, ' ').slice(0, 6).split('')

  function setDigit(index, ch) {
    const clean = ch.replace(/\D/g, '').slice(-1)
    const next = digits.map((d) => (d === ' ' ? '' : d))
    next[index] = clean
    onChange(next.join(''))
    if (clean && index < 5) refs.current[index + 1]?.focus()
  }

  function onPaste(e) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!text) return
    e.preventDefault()
    onChange(text)
    refs.current[Math.min(text.length, 6) - 1]?.focus()
  }

  return (
    <div className="otp-row" onPaste={onPaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          className="otp-box"
          inputMode="numeric"
          value={d === ' ' ? '' : d}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
            if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
            if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
          }}
        />
      ))}
    </div>
  )
}
