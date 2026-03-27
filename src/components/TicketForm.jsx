import { useEffect, useRef, useState } from 'react'
import { BIKE_TYPES, PRIORITIES, CONTACT_PREFS } from '../lib/constants'

const INITIAL = {
  customerName: '', customerPhone: '', customerEmail: '', preferredContact: 'Téléphone',
  bikeType: 'VTT', bikeBrand: '', bikeModel: '', serialNumber: '',
  purchaseDate: '', underWarranty: false,
  issueDescription: '', accessoriesLeft: '',
  priority: 'Normal', dueDate: '', createdByName: '',
}

export default function TicketForm({ onSubmit, onClose, users = [] }) {
  const [form, setForm] = useState(INITIAL)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const overlayRef = useRef(null)

  useEffect(() => {
    const fn = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  function onOverlayClick(e) { if (e.target === overlayRef.current) onClose?.() }
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  const clean = (v) => (typeof v === 'string' ? v.trim() : v) || null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.customerName.trim()) return setError('Le nom du client est obligatoire.')
    if (!form.issueDescription.trim()) return setError('Décris le problème constaté.')
    if (form.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail))
      return setError("L'email saisi n'est pas valide.")
    setSubmitting(true)
    await onSubmit({
      customerName: clean(form.customerName), customerPhone: clean(form.customerPhone),
      customerEmail: clean(form.customerEmail), preferredContact: form.preferredContact,
      bikeType: form.bikeType, bikeBrand: clean(form.bikeBrand),
      bikeModel: clean(form.bikeModel), serialNumber: clean(form.serialNumber),
      purchaseDate: form.purchaseDate || null, underWarranty: form.underWarranty,
      issueDescription: clean(form.issueDescription), accessoriesLeft: clean(form.accessoriesLeft),
      priority: form.priority, dueDate: form.dueDate || null,
      createdByName: clean(form.createdByName),
    })
    setSubmitting(false)
  }

  return (
    <div
      ref={overlayRef}
      onClick={onOverlayClick}
      className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 pt-[5vh] overflow-y-auto"
    >
      <div className="w-full max-w-3xl flex flex-col rounded-2xl shadow-2xl border overflow-hidden
                      bg-white border-gray-200
                      dark:bg-neutral-900 dark:border-neutral-800">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b
                        border-gray-100 dark:border-neutral-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Nouveau ticket</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100
                       dark:text-neutral-500 dark:hover:text-neutral-200 dark:hover:bg-neutral-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-4">

            {error && (
              <div className="text-sm px-3 py-2 rounded-xl border
                              text-red-700 bg-red-50 border-red-200
                              dark:text-red-300 dark:bg-red-900/20 dark:border-red-500/30">
                {error}
              </div>
            )}

            {/* Client */}
            <Card title="Client">
              <Grid cols={2}>
                <Field label="Nom du client" required>
                  <input className="Input" value={form.customerName} onChange={e => set('customerName', e.target.value)} autoFocus />
                </Field>
                <Field label="Téléphone">
                  <input className="Input" value={form.customerPhone} onChange={e => set('customerPhone', e.target.value)} />
                </Field>
                <Field label="Email">
                  <input type="email" className="Input" value={form.customerEmail} onChange={e => set('customerEmail', e.target.value)} />
                </Field>
                <Field label="Contact préféré">
                  <select className="Input" value={form.preferredContact} onChange={e => set('preferredContact', e.target.value)}>
                    {CONTACT_PREFS.map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
              </Grid>
            </Card>

            {/* Vélo */}
            <Card title="Vélo">
              <Grid cols={3}>
                <Field label="Type">
                  <select className="Input" value={form.bikeType} onChange={e => set('bikeType', e.target.value)}>
                    {BIKE_TYPES.map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Marque">
                  <input className="Input" value={form.bikeBrand} onChange={e => set('bikeBrand', e.target.value)} />
                </Field>
                <Field label="Modèle">
                  <input className="Input" value={form.bikeModel} onChange={e => set('bikeModel', e.target.value)} />
                </Field>
                <Field label="N° de série">
                  <input className="Input" value={form.serialNumber} onChange={e => set('serialNumber', e.target.value)} />
                </Field>
                <Field label="Date d'achat">
                  <input type="date" className="Input" value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} />
                </Field>
                <Field label="Garantie">
                  <label className="inline-flex items-center gap-2 h-10 cursor-pointer">
                    <input id="warranty" type="checkbox" className="h-4 w-4 rounded" checked={form.underWarranty} onChange={e => set('underWarranty', e.target.checked)} />
                    <span className="text-sm text-gray-700 dark:text-neutral-300">Oui</span>
                  </label>
                </Field>
              </Grid>
            </Card>

            {/* Problème */}
            <Card title="Problème">
              <Grid cols={2}>
                <Field label="Problème signalé" required span2>
                  <textarea rows={4} className="Input" value={form.issueDescription} onChange={e => set('issueDescription', e.target.value)} />
                </Field>
                <Field label="Accessoires laissés" span2>
                  <textarea rows={2} className="Input" value={form.accessoriesLeft} onChange={e => set('accessoriesLeft', e.target.value)} placeholder="Antivol, lampes, sacoche…" />
                </Field>
              </Grid>
            </Card>

            {/* Suivi */}
            <Card title="Suivi">
              <Grid cols={3}>
                <Field label="Priorité">
                  <select className="Input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                    {PRIORITIES.map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Date prévue">
                  <input type="date" className="Input" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
                </Field>
                <Field label="Créé par">
                  {users.length > 0 ? (
                    <select className="Input" value={form.createdByName} onChange={e => set('createdByName', e.target.value)}>
                      <option value="">— Sélectionner</option>
                      {users.map(u => <option key={u.id} value={u.nom}>{u.nom}</option>)}
                    </select>
                  ) : (
                    <input className="Input" placeholder="Votre nom" value={form.createdByName} onChange={e => set('createdByName', e.target.value)} />
                  )}
                </Field>
              </Grid>
            </Card>

          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t
                          border-gray-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-4 rounded-lg text-xs font-medium border transition-colors
                         text-gray-700 border-gray-200 hover:bg-gray-50
                         dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-8 px-4 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50
                         bg-gray-900 text-white hover:bg-gray-700
                         dark:bg-white dark:text-black dark:hover:bg-gray-100"
            >
              {submitting ? 'Création…' : 'Créer le ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── UI helpers ── */
function Card({ title, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800
                      bg-gray-50/50 dark:bg-neutral-800/30">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-neutral-600" />
        <span className="text-xs font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Grid({ children, cols = 2 }) {
  return (
    <div className={`grid gap-x-5 gap-y-3 ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {children}
    </div>
  )
}

function Field({ label, children, required = false, span2 = false }) {
  return (
    <label className={`block space-y-1 ${span2 ? 'col-span-full' : ''}`}>
      <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  )
}
