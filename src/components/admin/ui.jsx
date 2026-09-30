// Éléments d'interface de l'administration (même style que commandes, transferts, B2B)
import { useEffect, useState } from 'react'
import { initials, sendSetupEmail } from '../../lib/accounts'

export const LABEL = 'text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide'
export const INVALID = '!border-red-400 dark:!border-red-500/70'
export const BTN_PRIMARY = 'h-8 px-3 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100'
export const BTN_SECONDARY = 'h-8 px-3 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50 text-gray-700 border-gray-200 bg-white hover:bg-gray-50 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800'

// Bloc titré : titre + compteur + action à droite
export function Section({ title, count, hint, action, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 ${className}`}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-neutral-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
            {count != null && (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400 tabular-nums">{count}</span>
            )}
          </div>
          {hint && <p className="text-[11px] text-gray-400 dark:text-neutral-500 mt-0.5">{hint}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

export function Notice({ notice, onClose }) {
  if (!notice) return null
  const ok = notice.tone === 'ok'
  return (
    <div className={['flex items-start gap-3 rounded-xl border px-3 py-2.5 text-xs',
      ok ? 'text-emerald-800 bg-emerald-50 border-emerald-200 dark:text-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20'
        : 'text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-900/20 dark:border-red-500/30'].join(' ')}>
      <p className="flex-1 leading-relaxed">{notice.text}</p>
      {onClose && (
        <button onClick={onClose} aria-label="Fermer le message" className="shrink-0 opacity-60 hover:opacity-100">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  )
}

export function Avatar({ name, dark = false, size = 'h-8 w-8 text-[11px]' }) {
  return (
    <span className={`${size} rounded-full grid place-items-center shrink-0 font-semibold ${dark
      ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
      : 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>
      {initials(name)}
    </span>
  )
}

export function Tag({ children, dark = false, dot }) {
  return (
    <span className={`h-5 px-1.5 inline-flex items-center gap-1 rounded text-[10px] font-semibold whitespace-nowrap ${dark
      ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
      : 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {children}
    </span>
  )
}

const ICONS = {
  edit: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  delete: 'M3 6h18M8 6V4.8A1.8 1.8 0 019.8 3h4.4A1.8 1.8 0 0116 4.8V6m3 0l-1 13a2 2 0 01-2 1.8H8A2 2 0 016 19L5 6M10 10v7M14 10v7',
  mail: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75',
}

export function IconButton({ icon, label, onClick, danger = false, disabled = false }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label}
      className={['h-8 w-8 sm:h-7 sm:w-7 grid place-items-center rounded-lg transition-colors disabled:opacity-40 text-gray-400',
        danger ? 'hover:text-red-600 hover:bg-red-50 dark:text-neutral-500 dark:hover:text-red-400 dark:hover:bg-red-500/10'
          : 'hover:text-gray-700 hover:bg-gray-100 dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800'].join(' ')}>
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[icon]} />
      </svg>
    </button>
  )
}

// « Renvoyer l'e-mail » de mot de passe d'un compte
export function ResendButton({ email }) {
  const [state, setState] = useState('idle') // idle | sending | sent | error
  const [error, setError] = useState('')
  async function send() {
    if (!email || state === 'sending') return
    setState('sending')
    const err = await sendSetupEmail(email)
    setError(err || '')
    setState(err ? 'error' : 'sent')
    setTimeout(() => setState('idle'), err ? 6000 : 3000)
  }
  if (state === 'sent' || state === 'error') {
    return (
      <span title={state === 'error' ? `Échec : ${error}` : `E-mail envoyé à ${email}`}
        className={`h-7 px-1.5 inline-flex items-center rounded-lg text-[10px] font-semibold ${state === 'sent'
          ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10'
          : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10'}`}>
        {state === 'sent' ? '✓ Envoyé' : 'Échec'}
      </span>
    )
  }
  return <IconButton icon="mail" label={`Renvoyer l’e-mail de mot de passe à ${email}`} onClick={send} disabled={!email || state === 'sending'} />
}

// Fenêtre (formulaires de création / modification)
export function Modal({ title, subtitle, onClose, children, footer, size = 'max-w-md' }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[400] flex items-start sm:items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div role="dialog" aria-modal="true" aria-label={title}
        className={`w-full ${size} rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl`}>
        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
            {subtitle && <p className="text-[11px] text-gray-400 dark:text-neutral-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer"
            className="h-8 w-8 -mr-1 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800 shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-4 sm:p-5 space-y-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 px-4 sm:px-5 py-3 border-t border-gray-100 dark:border-neutral-800">{footer}</div>
        )}
      </div>
    </div>
  )
}

export function Field({ label, error, hint, children, className = '' }) {
  return (
    <label className={`block space-y-1 min-w-0 ${className}`}>
      <span className={LABEL}>{label}</span>
      {children}
      {error ? <span className="block text-[11px] text-red-600 dark:text-red-400">{error}</span>
        : hint && <span className="block text-[11px] text-gray-400 dark:text-neutral-500">{hint}</span>}
    </label>
  )
}

export function EmptyState({ title, text, action }) {
  return (
    <div className="px-4 py-10 text-center space-y-1">
      <p className="text-sm font-semibold text-gray-700 dark:text-neutral-300">{title}</p>
      {text && <p className="text-xs text-gray-400 dark:text-neutral-500">{text}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  )
}
