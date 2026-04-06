import React from 'react'

export default function AuthLayout({ title, subtitle, eyebrow = 'Sports Predictor Account', children }) {
  return (
    <main className="auth-page view">
      <div className="auth-bg-shape shape-a" />
      <div className="auth-bg-shape shape-b" />
      <section className="auth-shell">
        <p className="auth-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>
        {children}
      </section>
    </main>
  )
}
