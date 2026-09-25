import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { PACKS } from '../lib/ilv'
import { BON_PLAN_COLLECTION, bonPlanDocId } from '../lib/bonPlan'
import { SEGMENT_LABELS, parsePrice } from '../lib/opImport'
import { CATALOGUE_SEGMENTS, catalogueData, catalogueFormErrors, catalogueFormValues, remiseSur } from '../lib/catalogueForm'

const euro = v => `${String(v).replace('.', ',')} €`

function Field({ label, error, children, className = '' }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-[11px] font-semibold text-gray-500 dark:text-neutral-400">{label}</span>
      {children}
      {error && <span className="block text-[11px] text-red-500">{error}</span>}
    </label>
  )
}

function TextInput({ value, onChange, invalid, className = '', ...props }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} aria-invalid={invalid || undefined}
      className={`Input ${invalid ? '!border-red-400 dark:!border-red-500/60' : ''} ${className}`} {...props} />
  )
}

// Champ prix avec « € » à droite
function PriceInput({ value, onChange, invalid, ...props }) {
  return (
    <div className="relative">
      <TextInput value={value} onChange={onChange} invalid={invalid} inputMode="decimal" className="pr-8" {...props} />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">€</span>
    </div>
  )
}

function Section({ title, hint, children }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-bold text-gray-900 dark:text-white">{title}</h3>
        {hint && <p className="text-[11px] text-gray-400 dark:text-neutral-500">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

// Prix spécial activable (prix engagé, prix bon plan)
function SpecialPrice({ checked, onToggle, title, description, color, price, onPrice, error, remise, disabled }) {
  const [toggled, setToggled] = useState(false) // le champ prend le focus seulement après un clic
  const on = { blue: 'border-blue-300 bg-blue-50/60 dark:border-blue-500/40 dark:bg-blue-500/10', red: 'border-red-300 bg-red-50/60 dark:border-red-500/40 dark:bg-red-500/10' }[color]
  const track = { blue: 'bg-blue-700', red: 'bg-red-600' }[color]
  return (
    <div className={['rounded-xl border p-3 transition-colors', checked ? on : 'border-gray-200 dark:border-neutral-700'].join(' ')}>
      <button type="button" role="switch" aria-checked={checked} onClick={() => { setToggled(true); onToggle() }} disabled={disabled}
        className="w-full flex items-start justify-between gap-3 text-left disabled:opacity-50">
        <span>
          <span className="block text-xs font-semibold text-gray-900 dark:text-white">{title}</span>
          <span className="block text-[11px] text-gray-500 dark:text-neutral-400">{description}</span>
        </span>
        <span className={['relative shrink-0 h-5 w-9 rounded-full transition-colors', checked ? track : 'bg-gray-300 dark:bg-neutral-600'].join(' ')}>
          <span className={['absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5'].join(' ')} />
        </span>
      </button>
      {checked && (
        <div className="mt-3 flex items-start gap-3">
          <Field label="Prix" error={error} className="w-40">
            <PriceInput value={price} onChange={onPrice} invalid={!!error} placeholder="Ex. 1299,99" autoFocus={toggled} />
          </Field>
          {remise != null && (
            <span className="mt-6 text-[11px] font-bold px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">-{remise} %</span>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Ajout ou modification d'un produit de la base de données (acheteur / directeur général).
 * Prix fort et pack servent aux ILV. Prix engagé : l'ILV sort toujours en prix engagé.
 * Prix bon plan : le vélo est ajouté (ou retiré) de la liste des prix bon plan.
 * produits : base actuelle, pour refuser un chrono déjà utilisé.
 * Sans `produit.id`, c'est un ajout : `produit` peut pré-remplir la fiche (vélo de la liste des prix bon plan
 * pas encore dans la base) ; `start` : 'engage' ou 'bonPlan' pour démarrer avec ce prix spécial activé.
 */
export default function CatalogueProductModal({ produit, produits, start, onClose }) {
  const edit = !!produit?.id
  // Prix bon plan déjà enregistré pour ce chrono (fiche existante, ou vélo venu de la liste des prix bon plan)
  const oldBonPlanId = produit?.chrono ? bonPlanDocId({ chrono: produit.chrono }) : null
  const [form, setForm] = useState(() => ({
    ...catalogueFormValues(produit),
    ...(start === 'engage' ? { engage: true } : start === 'bonPlan' ? { bonPlan: true } : {}),
  }))
  const [bonPlanLoaded, setBonPlanLoaded] = useState(!oldBonPlanId)
  const [hadBonPlan, setHadBonPlan] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Prix bon plan actuel du produit (liste des prix bon plan)
  useEffect(() => {
    if (!oldBonPlanId) return
    getDoc(doc(db, BON_PLAN_COLLECTION, oldBonPlanId))
      .then(snap => {
        if (snap.exists() && snap.get('prixBonPlan') != null) {
          setHadBonPlan(true)
          setForm(f => ({ ...f, bonPlan: true, prixBonPlan: String(snap.get('prixBonPlan')).replace('.', ',') }))
        }
      })
      .finally(() => setBonPlanLoaded(true))
  }, [oldBonPlanId])

  useEffect(() => {
    const fn = e => e.key === 'Escape' && !saving && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose, saving])

  const errors = catalogueFormErrors(form, { produits, id: produit?.id })
  const accessoire = form.segment === 'accessoires'
  const shown = submitted ? errors : {}

  async function handleSave(e) {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length || !bonPlanLoaded) return
    setSaving(true)
    setError('')
    const data = catalogueData(form)
    try {
      const batch = writeBatch(db)
      const ref = edit ? doc(db, 'catalogue_produits', produit.id) : doc(collection(db, 'catalogue_produits'))
      batch.set(ref, { ...data, [edit ? 'updatedAt' : 'createdAt']: serverTimestamp() }, { merge: true })
      // Liste des prix bon plan : un document par chrono
      const newBonPlanId = bonPlanDocId({ chrono: data.chrono })
      if (hadBonPlan && (!form.bonPlan || oldBonPlanId !== newBonPlanId)) batch.delete(doc(db, BON_PLAN_COLLECTION, oldBonPlanId))
      if (form.bonPlan) {
        batch.set(doc(db, BON_PLAN_COLLECTION, newBonPlanId), {
          chrono: data.chrono, nom: data.nom, marque: data.marque, couleur: data.couleur, segment: data.segment,
          prixFort: data.prixFort, prixBonPlan: parsePrice(form.prixBonPlan), updatedAt: serverTimestamp(),
        }, { merge: true })
      }
      await batch.commit()
      onClose()
    } catch {
      setError("L'enregistrement a échoué. Vérifie la connexion et réessaie.")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Supprimer « ${produit.nom} » (${produit.chrono || 'sans chrono'}) de la base de données ?`)) return
    try { await deleteDoc(doc(db, 'catalogue_produits', produit.id)); onClose() }
    catch { setError('La suppression a échoué.') }
  }

  const input = k => ({ value: form[k], onChange: v => set(k, v), invalid: !!shown[k] })

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="produit-title">
      <form onSubmit={handleSave} noValidate
        className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-neutral-800 shrink-0">
          <div>
            <h2 id="produit-title" className="text-sm font-semibold text-gray-900 dark:text-white">{edit ? 'Modifier le produit' : 'Ajouter un produit'}</h2>
            <p className="text-[11px] text-gray-400 dark:text-neutral-500">
              {edit ? `${produit.nom} · ${produit.chrono || 'sans chrono'}`
                : produit?.chrono ? 'Ce vélo n’est pas encore dans la base de données : l’enregistrer l’y ajoute.'
                : 'Nouveau vélo dans la base de données'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          <Section title="Produit">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nom *" error={shown.nom} className="col-span-2">
                <TextInput {...input('nom')} placeholder="Ex. ALLROAD 450" autoFocus={!edit} />
              </Field>
              <Field label="Marque"><TextInput {...input('marque')} placeholder="Ex. NAKAMURA" /></Field>
              <Field label="Couleur"><TextInput {...input('couleur')} placeholder="Ex. NOIR" /></Field>
              <Field label="Chrono *" error={shown.chrono}><TextInput {...input('chrono')} placeholder="Ex. 0-252871" className="font-mono" /></Field>
              <Field label="Référence"><TextInput {...input('reference')} placeholder="Ex. YJ60H8PF B06ZZS" className="font-mono" /></Field>
              <Field label="Famille"><TextInput {...input('famille')} placeholder="Ex. VTC" /></Field>
              <Field label="Segment">
                <select className="Input" value={form.segment} onChange={e => set('segment', e.target.value)}>
                  <option value="">—</option>
                  {CATALOGUE_SEGMENTS.map(k => <option key={k} value={k}>{SEGMENT_LABELS[k]}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          <Section title={accessoire ? 'Prix' : 'Prix et pack'}
            hint={accessoire ? 'Accessoire : pas de pack optionnel, l’ILV affiche le prix seul.' : 'Utilisés pour les ILV : le pack est toujours ajouté au prix affiché.'}>
            <Field label="Prix fort *" error={shown.prixFort} className="w-44">
              <PriceInput {...input('prixFort')} placeholder="Ex. 1499,99" />
            </Field>
            {!accessoire && <div className="space-y-1">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-neutral-400">Pack optionnel *</span>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pack optionnel">
                {Object.entries(PACKS).map(([k, p]) => {
                  const active = form.pack === k
                  return (
                    <button key={k} type="button" role="radio" aria-checked={active} onClick={() => set('pack', k)}
                      className={['rounded-xl border px-3 py-2 text-left transition-colors',
                        active ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-black'
                          : shown.pack ? 'border-red-300 dark:border-red-500/50' : 'border-gray-200 hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800'].join(' ')}>
                      <span className="block text-xs font-semibold">{p.label}</span>
                      <span className={`block text-[11px] ${active ? 'opacity-80' : 'text-gray-500 dark:text-neutral-400'}`}>1 an {euro(p.prix[1])} · 2 ans {euro(p.prix[2])}</span>
                    </button>
                  )
                })}
              </div>
              {shown.pack && <span className="block text-[11px] text-red-500">{shown.pack}</span>}
            </div>}
          </Section>

          <Section title="Prix spéciaux">
            <div className="space-y-2">
              <SpecialPrice color="blue" checked={form.engage} onToggle={() => set('engage', !form.engage)}
                title="Prix engagé" description="L’ILV de ce vélo sort toujours en « Prix engagé »."
                price={form.prixEngage} onPrice={v => set('prixEngage', v)} error={shown.prixEngage}
                remise={remiseSur(form.prixFort, form.prixEngage)} />
              <SpecialPrice color="red" checked={form.bonPlan} onToggle={() => set('bonPlan', !form.bonPlan)} disabled={!bonPlanLoaded}
                title="Prix bon plan" description="Réservé aux porteurs de la carte fidélité : le vélo est ajouté à la liste des prix bon plan."
                price={form.prixBonPlan} onPrice={v => set('prixBonPlan', v)} error={shown.prixBonPlan}
                remise={remiseSur(form.prixFort, form.prixBonPlan)} />
              {hadBonPlan && !form.bonPlan && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">Le vélo sera retiré de la liste des prix bon plan.</p>
              )}
            </div>
          </Section>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800 shrink-0">
          {edit ? (
            <button type="button" onClick={handleDelete}
              className="h-9 px-3 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
              Supprimer
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            {(error || (submitted && Object.keys(errors).length > 0)) && (
              <span className="text-[11px] text-red-500">{error || 'Complète les champs en rouge.'}</span>
            )}
            <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">Annuler</button>
            <button type="submit" disabled={saving || !bonPlanLoaded}
              className="h-9 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
              {saving ? 'Enregistrement…' : edit ? 'Enregistrer' : 'Ajouter le produit'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
