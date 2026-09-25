import { useState } from 'react'
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { PACKS } from '../lib/ilv'
import { cleanRef, parsePrice } from '../lib/opImport'

const label = 'text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide'

/**
 * Ajout ou modification d'un produit de la base de données (acheteur / directeur général).
 * Prix fort et pack optionnel servent aux ILV ; un vélo en prix engagé sort toujours en ILV « Prix engagé ».
 * produits : base actuelle, pour refuser un chrono déjà utilisé.
 */
export default function CatalogueProductModal({ produit, produits, onClose }) {
  const edit = !!produit?.id
  const [form, setForm] = useState({
    chrono:     produit?.chrono     || '',
    reference:  produit?.reference  || '',
    nom:        produit?.nom        || '',
    marque:     produit?.marque     || '',
    couleur:    produit?.couleur    || '',
    famille:    produit?.famille    || '',
    segment:    produit?.segment    || '',
    univers:    produit?.univers    || '',
    prixFort:   produit?.prixFort   != null ? String(produit.prixFort).replace('.', ',') : '',
    pack:       produit?.pack       || '',
    engage:     produit?.prixEngage != null,
    prixEngage: produit?.prixEngage != null ? String(produit.prixEngage).replace('.', ',') : '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const chrono = cleanRef(form.chrono)
  const prixFort = parsePrice(form.prixFort)
  const prixEngage = form.engage ? parsePrice(form.prixEngage) : null
  const doublon = chrono && produits.some(p => p.id !== produit?.id && cleanRef(p.chrono) === chrono)
  const problem =
    !form.nom.trim() ? 'Le nom est obligatoire.'
    : !chrono ? 'Le chrono est obligatoire.'
    : doublon ? 'Ce chrono existe déjà dans la base de données.'
    : prixFort == null ? 'Le prix fort est obligatoire.'
    : !form.pack ? 'Choisis le pack optionnel de ce vélo.'
    : form.engage && prixEngage == null ? 'Renseigne le prix engagé.'
    : form.engage && prixEngage >= prixFort ? 'Le prix engagé doit être inférieur au prix fort.'
    : null

  async function handleSave(e) {
    e.preventDefault()
    if (problem) { setError(problem); return }
    setSaving(true)
    setError('')
    const data = {
      chrono,
      reference: cleanRef(form.reference) || null,
      nom:       form.nom.trim().toUpperCase(),
      marque:    form.marque.trim().toUpperCase() || null,
      couleur:   form.couleur.trim() || null,
      famille:   form.famille.trim() || null,
      segment:   form.segment.trim() || null,
      univers:   form.univers.trim() || null,
      prixFort,
      pack:      form.pack,
      prixEngage,
    }
    try {
      if (edit) await updateDoc(doc(db, 'catalogue_produits', produit.id), { ...data, updatedAt: serverTimestamp() })
      else await addDoc(collection(db, 'catalogue_produits'), { ...data, createdAt: serverTimestamp() })
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

  const field = (k, text, props = {}) => (
    <label className={`space-y-1 ${props.wide ? 'col-span-2' : ''}`}>
      <span className={label}>{text}</span>
      <input className="Input" value={form[k]} onChange={e => set(k, e.target.value)} {...(props.input || {})} />
    </label>
  )

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{edit ? 'Modifier le produit' : 'Ajouter un produit'}</span>
          <button onClick={onClose} aria-label="Fermer" className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {field('nom', 'Nom *', { wide: true, input: { autoFocus: !edit } })}
            {field('chrono', 'Chrono *')}
            {field('reference', 'Référence')}
            {field('marque', 'Marque')}
            {field('couleur', 'Couleur')}
            {field('famille', 'Famille')}
            {field('segment', 'Segment')}
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-neutral-700 p-3 space-y-3">
            <p className="text-xs font-semibold text-gray-700 dark:text-neutral-300">Prix et ILV</p>
            <div className="grid grid-cols-2 gap-3">
              {field('prixFort', 'Prix fort (€) *', { input: { inputMode: 'decimal', placeholder: '1499,99' } })}
              <label className="space-y-1">
                <span className={label}>Pack optionnel *</span>
                <select className="Input" value={form.pack} onChange={e => set('pack', e.target.value)}>
                  <option value="">Choisir…</option>
                  {Object.entries(PACKS).map(([k, p]) => (
                    <option key={k} value={k}>{p.label} ({String(p.prix[1]).replace('.', ',')} € / {String(p.prix[2]).replace('.', ',')} €)</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-neutral-300 cursor-pointer">
              <input type="checkbox" checked={form.engage} onChange={e => set('engage', e.target.checked)} className="h-4 w-4 accent-blue-700" />
              Vélo en <strong>prix engagé</strong> (son ILV sort toujours en prix engagé)
            </label>
            {form.engage && field('prixEngage', 'Prix engagé (€) *', { input: { inputMode: 'decimal', placeholder: '1299,99' } })}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex items-center justify-between pt-1">
            {edit ? (
              <button type="button" onClick={handleDelete}
                className="h-8 px-3 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10">
                Supprimer
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">Annuler</button>
              <button type="submit" disabled={saving}
                className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
                {saving ? 'Enregistrement…' : edit ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
