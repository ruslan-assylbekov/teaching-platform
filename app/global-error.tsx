'use client'

// Catches failures in the root layout itself (design spec §5.4: "Database
// unreachable -> generic error page. No stack traces, no connection
// strings"). Deliberately does not use next-intl or any app CSS/component
// -- if we're here, the root layout's own providers may be exactly what
// failed, so this can't depend on them working. Hardcoded bilingual text
// instead of a locale lookup.
export default function GlobalError() {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#faf6ee', color: '#2a231c', fontFamily: 'system-ui, sans-serif' }}>
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: 360 }}>
            <h1 style={{ fontFamily: 'Georgia, serif', margin: '0 0 0.5em' }}>Something went wrong</h1>
            <p style={{ margin: 0 }}>
              Пожалуйста, попробуйте ещё раз через минуту.
              <br />
              Please try again in a moment.
            </p>
          </div>
        </div>
      </body>
    </html>
  )
}
