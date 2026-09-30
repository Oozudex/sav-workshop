// Champs d'une commande OBUT (création et modification) : client, boules, marquage, services et récapitulatif des prix
import { catalogueByKind, catalogueChoice, obutMinDeposit, obutRemaining, obutTotal } from '../../lib/obut'
import { formatEuro, parseEuro } from '../../lib/orders'
import { INVALID } from '../admin/ui'

function Block({ title, children, aside }) {
  return (
    <section className="rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
        <span className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 uppercase tracking-wide">{title}</span>
        {aside}
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  )
}

function F({ label, required, error, hint, className = '', children }) {
  return (
    <label className={`block space-y-1 min-w-0 ${className}`}>
      <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
      {error ? <span className="block text-[11px] text-red-600 dark:text-red-400">{error}</span>
        : hint && <span className="block text-[11px] text-gray-400 dark:text-neutral-500">{hint}</span>}
    </label>
  )
}

function PriceInput({ value, onChange, invalid, label }) {
  return (
    <div className="relative w-28 shrink-0">
      <input className={`Input h-9 text-sm !pr-6 text-right tabular-nums ${invalid ? INVALID : ''}`} inputMode="decimal"
        aria-label={`Prix ${label}`} value={value} onChange={e => onChange(e.target.value)} placeholder="0,00" />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
    </div>
  )
}

export default function ObutFields({ form, setForm, catalogue, staff, errors = {}, autoFocus = false }) {
  const { boule, marquage, option } = catalogueByKind(catalogue)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Références de la commande absentes du catalogue (retirées depuis, ou anciennes commandes)
  const bouleChoices = form.modele && !boule.some(b => b.id === form.modele.id) ? [...boule, { ...form.modele, off: true }] : boule
  const marquageChoices = form.marquage && !marquage.some(m => m.id === form.marquage.id) ? [...marquage, { ...form.marquage, off: true }] : marquage
  const optionChoices = [...option, ...form.options.filter(o => !option.some(c => c.id === o.id)).map(o => ({ ...o, off: true }))]

  function chooseModele(id) {
    const item = bouleChoices.find(b => b.id === id)
    if (item) set('modele', item.off ? form.modele : catalogueChoice(item))
  }
  function chooseMarquage(id) {
    if (!id) { setForm(f => ({ ...f, marquage: null, marquageTexte: '' })); return }
    const item = marquageChoices.find(m => m.id === id)
    if (item) set('marquage', item.off ? form.marquage : catalogueChoice(item))
  }
  function toggleOption(item) {
    const has = form.options.some(o => o.id === item.id)
    set('options', has ? form.options.filter(o => o.id !== item.id)
      : [...form.options, item.off ? { id: item.id, label: item.label, prix: item.prix } : catalogueChoice(item)])
  }
  const setLinePrice = (key, prix) => setForm(f => key === 'modele' ? { ...f, modele: { ...f.modele, prix } }
    : key === 'marquage' ? { ...f, marquage: { ...f.marquage, prix } }
      : { ...f, options: f.options.map(o => o.id === key ? { ...o, prix } : o) })

  const total = obutTotal(form)
  const reste = obutRemaining(form)
  const minDeposit = obutMinDeposit(form)
  const money = v => (v == null || v === '' ? '' : Number(v).toFixed(2).replace('.', ','))

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <Block title="Client">
          <div className="grid grid-cols-2 gap-3">
            <F label="Nom" required error={errors.clientNom}>
              <input className={`Input ${errors.clientNom ? INVALID : ''}`} value={form.clientNom} onChange={e => set('clientNom', e.target.value)} autoFocus={autoFocus} />
            </F>
            <F label="Prénom">
              <input className="Input" value={form.clientPrenom} onChange={e => set('clientPrenom', e.target.value)} />
            </F>
            <F label="Téléphone" required error={errors.clientTel} className="col-span-2 sm:col-span-1">
              <input className={`Input ${errors.clientTel ? INVALID : ''}`} type="tel" inputMode="tel" value={form.clientTel}
                onChange={e => set('clientTel', e.target.value)} placeholder="06 12 34 56 78" />
            </F>
            <F label="Date de commande" className="col-span-2 sm:col-span-1">
              <input className="Input" type="date" value={form.dateCommande} onChange={e => set('dateCommande', e.target.value)} />
            </F>
            <F label="Vendeur" className="col-span-2">
              <select className="Input" value={form.vendeur} onChange={e => set('vendeur', e.target.value)}>
                <option value="">— Non renseigné</option>
                {form.vendeur && !staff.some(s => s.nom === form.vendeur) && <option value={form.vendeur}>{form.vendeur}</option>}
                {staff.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
              </select>
            </F>
          </div>
        </Block>

        <Block title="Boules">
          <div className="grid grid-cols-3 gap-3">
            <F label="Modèle" required error={errors.modele} className="col-span-3">
              <select className={`Input ${errors.modele ? INVALID : ''}`} value={form.modele?.id || ''} onChange={e => chooseModele(e.target.value)}>
                {!form.modele && <option value="">— Choisir un modèle</option>}
                {bouleChoices.map(b => (
                  <option key={b.id} value={b.id}>{b.label} — {formatEuro(parseEuro(b.prix))}{b.off ? ' (hors catalogue)' : ''}</option>
                ))}
              </select>
            </F>
            <F label="Diamètre">
              <input className="Input" value={form.diametre} onChange={e => set('diametre', e.target.value)} placeholder="72 mm" />
            </F>
            <F label="Strie">
              <input className="Input" value={form.strie} onChange={e => set('strie', e.target.value)} placeholder="0" />
            </F>
            <F label="Poids">
              <input className="Input" value={form.poids} onChange={e => set('poids', e.target.value)} placeholder="690 g" />
            </F>
          </div>
        </Block>
      </div>

      <Block title="Marquage et services">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <F label="Marquage">
            <select className="Input" value={form.marquage?.id || ''} onChange={e => chooseMarquage(e.target.value)}>
              <option value="">Sans marquage</option>
              {marquageChoices.map(m => (
                <option key={m.id} value={m.id}>{m.label} — {formatEuro(parseEuro(m.prix))}{m.off ? ' (hors catalogue)' : ''}</option>
              ))}
            </select>
          </F>
          <F label="Texte à graver" required={!!form.marquage} error={errors.marquageTexte}>
            <input className={`Input ${errors.marquageTexte ? INVALID : ''}`} value={form.marquageTexte} disabled={!form.marquage}
              onChange={e => set('marquageTexte', e.target.value)} placeholder={form.marquage ? 'Texte, initiales…' : 'Choisissez un marquage'} />
          </F>
        </div>
        {optionChoices.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {optionChoices.map(o => {
              const on = form.options.some(x => x.id === o.id)
              return (
                <button key={o.id} type="button" onClick={() => toggleOption(o)} aria-pressed={on}
                  className={['h-9 sm:h-8 px-3 inline-flex items-center gap-2 rounded-lg border text-xs font-medium transition-colors',
                    on ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-black'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'].join(' ')}>
                  <span className={`h-3.5 w-3.5 rounded border grid place-items-center ${on ? 'border-current' : 'border-gray-300 dark:border-neutral-600'}`}>
                    {on && <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                  </span>
                  {o.label}
                  <span className="opacity-60 tabular-nums">{formatEuro(parseEuro(o.prix))}</span>
                </button>
              )
            })}
          </div>
        )}
      </Block>

      <Block title="Récapitulatif" aside={<span className="text-[11px] text-gray-400 dark:text-neutral-500">Prix modifiables pour cette commande</span>}>
        <div className="divide-y divide-gray-100 dark:divide-neutral-800 -my-1.5">
          {form.modele && (
            <div className="flex items-center gap-3 py-1.5">
              <span className="flex-1 min-w-0 text-sm text-gray-800 dark:text-neutral-200 truncate">Boules {form.modele.label}</span>
              <PriceInput label="des boules" value={form.modele.prix} invalid={errors.prixModele} onChange={v => setLinePrice('modele', v)} />
            </div>
          )}
          {form.marquage && (
            <div className="flex items-center gap-3 py-1.5">
              <span className="flex-1 min-w-0 text-sm text-gray-800 dark:text-neutral-200">
                <span className="block truncate">{form.marquage.label}</span>
                {form.marquageTexte && <span className="block text-[11px] text-gray-400 dark:text-neutral-500 truncate">« {form.marquageTexte} »</span>}
              </span>
              <PriceInput label="du marquage" value={form.marquage.prix} invalid={errors.prixMarquage} onChange={v => setLinePrice('marquage', v)} />
            </div>
          )}
          {form.options.map(o => (
            <div key={o.id} className="flex items-center gap-3 py-1.5">
              <span className="flex-1 min-w-0 text-sm text-gray-800 dark:text-neutral-200 truncate">{o.label}</span>
              <PriceInput label={o.label} value={o.prix} invalid={errors.options} onChange={v => setLinePrice(o.id, v)} />
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-200 dark:border-neutral-700 p-3 grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-1">Total TTC</p>
            <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tabular-nums">{formatEuro(total)}</p>
          </div>
          <label className="block col-span-2 sm:col-span-1 order-last sm:order-none">
            <span className="block text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-1">Acompte</span>
            <div className="relative">
              <input className={`Input h-9 text-sm !pr-6 text-right tabular-nums ${errors.acompte ? INVALID : ''}`} inputMode="decimal"
                value={form.acompte} onChange={e => set('acompte', e.target.value)} onBlur={e => { const n = parseEuro(e.target.value); if (n != null) set('acompte', money(n)) }} placeholder={minDeposit ? `min ${money(minDeposit)}` : '0,00'}
                title={minDeposit ? `Acompte minimum : 30 % du total, soit ${formatEuro(minDeposit)}` : undefined} />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
            </div>
          </label>
          <div className="text-right">
            <p className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-1">Reste</p>
            <p className={`text-base sm:text-lg font-bold tabular-nums ${reste > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatEuro(reste)}</p>
          </div>
        </div>
        {(errors.acompte || errors.prixModele || errors.prixMarquage || errors.options) && (
          <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{errors.acompte || 'Un prix est invalide.'}</p>
        )}
      </Block>
    </div>
  )
}
