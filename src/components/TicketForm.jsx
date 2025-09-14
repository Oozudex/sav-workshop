import { useEffect, useRef, useState } from 'react'

const BIKE_TYPES = ['VTT', 'Route', 'Gravel', 'Urbain', 'Enfant']
const PRIORITIES = ['Normal', 'Urgent']
const CONTACT_PREFS = ['Téléphone', 'Email', 'Indifférent']

export default function TicketForm({ onSubmit, onClose }) {
  // --- state
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [preferredContact, setPreferredContact] = useState('Téléphone')

  const [bikeType, setBikeType] = useState('VTT')
  const [bikeBrand, setBikeBrand] = useState('')
  const [bikeModel, setBikeModel] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [underWarranty, setUnderWarranty] = useState(false)

  const [issueDescription, setIssueDescription] = useState('')
  const [accessoriesLeft, setAccessoriesLeft] = useState('')

  const [priority, setPriority] = useState('Normal')
  const [dueDate, setDueDate] = useState('')
  const [assignedTo, setAssignedTo] = useState('')

  const [error, setError] = useState('')
  const overlayRef = useRef(null)

  // --- UX: fermer (Échap + clic extérieur)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  function onOverlayClick(e) { if (e.target === overlayRef.current) onClose?.() }

  // --- submit
  const clean = (v) => (typeof v === 'string' ? v.trim() : v) || null
  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!customerName.trim()) return setError('Le nom du client est obligatoire.')
    if (!issueDescription.trim()) return setError('Décris le problème constaté.')
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return setError("L'email saisi n'est pas valide.")
    }
    await onSubmit({
      customerName: clean(customerName),
      customerPhone: clean(customerPhone),
      customerEmail: clean(customerEmail),
      preferredContact,
      bikeType,
      bikeBrand: clean(bikeBrand),
      bikeModel: clean(bikeModel),
      serialNumber: clean(serialNumber),
      purchaseDate: purchaseDate || null,
      underWarranty,
      issueDescription: clean(issueDescription),
      accessoriesLeft: clean(accessoriesLeft),
      priority,
      dueDate: dueDate || null,
      assignedTo: clean(assignedTo),
    })
  }

  return (
    <div
      ref={overlayRef}
      onClick={onOverlayClick}
      className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      {/* Container bi-thème */}
      <div className="
          w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden rounded-3xl shadow-2xl
          border border-gray-200 bg-white
          dark:border-white/10 dark:bg-gradient-to-b dark:from-neutral-900 dark:to-neutral-950
        ">
        {/* Header fixe */}
        <div className="px-5 py-4 border-b bg-white/90 backdrop-blur border-gray-200
                        dark:bg-neutral-900/80 dark:border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-neutral-100">Nouveau ticket</h2>
          <button onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-xl border text-gray-700 hover:bg-gray-50
                       border-gray-300
                       dark:text-neutral-200 dark:border-white/15 dark:hover:bg-white/5">
            Fermer
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          {/* Alert d'erreur (reste en haut) */}
          {error && (
            <div className="px-5 pt-3">
              <div className="text-sm rounded-xl px-3 py-2 border
                              text-red-700 bg-red-50 border-red-200
                              dark:text-red-300 dark:bg-red-900/30 dark:border-red-800">
                {error}
              </div>
            </div>
          )}

          {/* Corps scrollable */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            {/* Client */}
            <Section title="Client">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Nom du client" required>
                  <input className="Input" value={customerName} onChange={e => setCustomerName(e.target.value)} required />
                </Field>
                <Field label="Téléphone">
                  <input className="Input" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                </Field>
                <Field label="Email">
                  <input type="email" className="Input" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} />
                </Field>
                <Field label="Contact préféré">
                  <select className="Input" value={preferredContact} onChange={e => setPreferredContact(e.target.value)}>
                    {CONTACT_PREFS.map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
              </div>
            </Section>

            {/* Vélo */}
            <Section title="Vélo">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Type de vélo">
                  <select className="Input" value={bikeType} onChange={e => setBikeType(e.target.value)}>
                    {BIKE_TYPES.map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Marque"><input className="Input" value={bikeBrand} onChange={e => setBikeBrand(e.target.value)} /></Field>
                <Field label="Modèle"><input className="Input" value={bikeModel} onChange={e => setBikeModel(e.target.value)} /></Field>
                <Field label="N° de série"><input className="Input" value={serialNumber} onChange={e => setSerialNumber(e.target.value)} /></Field>
                <Field label="Date d'achat"><input type="date" className="Input" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} /></Field>
                <Field label="Sous garantie ?">
                  <div className="flex items-center gap-2 h-[42px]">
                    <input id="warranty" type="checkbox" className="h-4 w-4" checked={underWarranty} onChange={e => setUnderWarranty(e.target.checked)} />
                    <label htmlFor="warranty" className="text-sm">Oui</label>
                  </div>
                </Field>
              </div>
            </Section>

            {/* Problème */}
            <Section title="Problème">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Problème signalé" required full>
                  <textarea rows={4} className="Input" value={issueDescription} onChange={e => setIssueDescription(e.target.value)} required />
                </Field>
                <Field label="Accessoires laissés (antivol, lampes, sacoches...)">
                  <textarea rows={4} className="Input" value={accessoriesLeft} onChange={e => setAccessoriesLeft(e.target.value)} />
                </Field>
              </div>
            </Section>

            {/* Suivi */}
            <Section title="Suivi">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Priorité">
                  <select className="Input" value={priority} onChange={e => setPriority(e.target.value)}>
                    {PRIORITIES.map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Date prévue (retour client)">
                  <input type="date" className="Input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </Field>
                <Field label="Assigné à">
                  <input className="Input" placeholder="Nom du mécano" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} />
                </Field>
              </div>
            </Section>
          </div>

          {/* Footer fixe */}
          <div className="px-5 py-3 border-t bg-white/90 border-gray-200
                          dark:bg-neutral-900/80 dark:border-white/10
                          flex items-center justify-end gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-xl border text-gray-700 hover:bg-gray-50 border-gray-300
                         dark:text-neutral-200 dark:border-white/15 dark:hover:bg-white/5">
              Annuler
            </button>
            <button type="submit"
              className="px-4 py-2 rounded-xl bg-black text-white shadow hover:opacity-90
                         dark:bg-white dark:text-black">
              Créer
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ---------- UI helpers ---------- */
function Section({ title, children }) {
  return (
    <div className="rounded-2xl border bg-white border-gray-200
                    dark:bg-neutral-900/60 dark:border-white/10">
      <div className="px-4 py-2 border-b border-gray-200 dark:border-white/10 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-gray-300 dark:bg-white/20" />
        <h4 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{title}</h4>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Field({ label, required = false, children, full = false }) {
  return (
    <label className={`${full ? 'md:col-span-2' : ''} block`}>
      <div className="text-sm font-medium text-gray-700 dark:text-neutral-300 mb-1">
        {label} {required && <span className="text-red-600">*</span>}
      </div>
      {children}
    </label>
  )
}
