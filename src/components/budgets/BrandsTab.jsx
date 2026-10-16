// Onglet « Marques » des budgets : liste commune des marques par univers et segment. Un acheteur ajoute,
// renomme et supprime les marques de ses univers ; la direction toutes. Les segments viennent des bases
// importées dans les budgets.
import { useMemo, useState } from 'react'
import { BTN_SECONDARY, EmptyState, IconButton, Notice, Section } from '../admin/ui'
import { buyerFilterTest, canEditUnivers, defaultBuyerFilter, normLabel, segmentsCatalog, sortSegments } from '../../lib/budgets'
import { deleteBrand, renameBrand, useAcheteurs, useBrands, useBudgetUnivers, useBudgetUser, useBudgets } from '../../lib/budgetsStore'
import BuyerFilter from './BuyerFilter'
import { AddBrandForm, CELL_INPUT } from './SegmentSaisie'

function BrandChip({ brand, siblings, editable, user, onError }) {
  const [renaming, setRenaming] = useState(null)

  function save(e) {
    e.preventDefault()
    if (renaming == null) return
    const nom = renaming.trim().toUpperCase()
    setRenaming(null)
    if (!nom || nom === brand.nom) return
    if (siblings.some(b => b.id !== brand.id && normLabel(b.nom) === normLabel(nom))) return onError(`« ${nom} » existe déjà dans ce segment.`)
    renameBrand(brand.id, nom, user).catch(err => onError(err.message))
  }

  function remove() {
    if (!confirm(`Supprimer la marque « ${brand.nom} » de la liste ?\nLes montants déjà saisis dans les budgets restent visibles (marque « retirée »).`)) return
    deleteBrand(brand.id).catch(err => onError(err.message))
  }

  if (renaming != null) {
    return (
      <form onSubmit={save}>
        <input autoFocus value={renaming} onChange={e => setRenaming(e.target.value)} onBlur={save}
          onKeyDown={e => e.key === 'Escape' && setRenaming(null)} aria-label={`Nouveau nom de ${brand.nom}`}
          className={`${CELL_INPUT} w-44 uppercase`} />
      </form>
    )
  }
  return (
    <span className={`h-8 inline-flex items-center gap-0.5 rounded-lg border text-xs font-semibold text-gray-800 dark:text-neutral-100 border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 ${editable ? 'pl-3 pr-0.5' : 'px-3'}`}>
      {brand.nom}
      {editable && <>
        <IconButton icon="edit" label={`Renommer ${brand.nom}`} onClick={() => setRenaming(brand.nom)} />
        <IconButton icon="delete" danger label={`Supprimer ${brand.nom}`} onClick={remove} />
      </>}
    </span>
  )
}

export default function BrandsTab() {
  const user = useBudgetUser()
  const { list: brands, loading } = useBrands()
  const { list: budgets } = useBudgets()
  const { list: universList } = useBudgetUnivers()
  const acheteurs = useAcheteurs()
  const [filtre, setFiltre] = useState(() => defaultBuyerFilter(user))
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(() => new Set())
  const [error, setError] = useState('')
  const isAcheteur = user.role === 'acheteur'

  // Segments : ceux des budgets, plus ceux des marques dont le segment n'est plus dans aucun budget
  const segments = useMemo(() => sortSegments(
    segmentsCatalog(budgets, brands.map(b => ({ id: b.segId, univers: b.univers, nom: b.segment || '' }))),
    universList.map(u => u.nom)), [budgets, brands, universList])
  const bySeg = useMemo(() => {
    const m = new Map()
    for (const b of [...brands].sort((x, y) => x.nom.localeCompare(y.nom, 'fr'))) {
      if (!m.has(b.segId)) m.set(b.segId, [])
      m.get(b.segId).push(b)
    }
    return m
  }, [brands])

  const needle = normLabel(q)
  const keep = useMemo(() => buyerFilterTest(filtre, acheteurs), [filtre, acheteurs])
  const groups = useMemo(() => {
    const g = []
    for (const s of segments) {
      if (!keep(s.univers, s.nom)) continue
      const list = (bySeg.get(s.id) || []).filter(b => !needle || normLabel(b.nom).includes(needle))
      if (needle && !list.length) continue
      if (g.at(-1)?.univers !== s.univers) g.push({ univers: s.univers, segments: [] })
      g.at(-1).segments.push({ seg: s, list, all: bySeg.get(s.id) || [] })
    }
    return g
  }, [segments, bySeg, keep, needle])

  const isOpen = u => !!needle || open.has(u)
  const toggle = u => setOpen(s => { const n = new Set(s); if (n.has(u)) n.delete(u); else n.add(u); return n })

  return (
    <Section title="Marques" count={brands.length}
      hint="Marques avec lesquelles les acheteurs travaillent, par univers et segment. Elles apparaissent dans tous les budgets.">
      <div className="p-3 sm:p-4 space-y-3 border-b border-gray-100 dark:border-neutral-800">
        <div className="flex flex-col sm:flex-row gap-2">
          <BuyerFilter value={filtre} onChange={setFiltre} acheteurs={acheteurs} me={user.uid} />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une marque…"
            aria-label="Rechercher une marque" className="Input h-9 text-sm sm:max-w-xs" />
          {groups.length > 1 && !needle && (
            <button type="button" className={`${BTN_SECONDARY} sm:ml-auto`}
              onClick={() => setOpen(open.size ? new Set() : new Set(groups.map(g => g.univers)))}>
              {open.size ? 'Tout replier' : 'Tout déplier'}
            </button>
          )}
        </div>
        {isAcheteur && !user.univers.length && (
          <Notice notice={{ text: 'Aucun univers ne t’est attribué : la liste est en lecture seule. La direction attribue les univers dans Admin › Comptes.' }} />
        )}
        {error && <Notice notice={{ text: error }} onClose={() => setError('')} />}
      </div>

      {loading ? (
        <p className="px-4 py-6 text-xs text-gray-500 dark:text-neutral-400">Chargement…</p>
      ) : segments.length === 0 ? (
        <EmptyState title="Aucun segment" text="Importe la base d’un budget : ses univers et segments servent à ranger les marques." />
      ) : groups.length === 0 ? (
        <EmptyState title="Aucune marque" text={needle ? `Aucune marque ne correspond à « ${q.trim()} ».` : 'Aucun univers pour ce filtre : vérifie les univers attribués dans Admin › Comptes.'} />
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
          {groups.map(g => {
            const editable = g.segments.some(({ seg }) => canEditUnivers(user, g.univers, seg.nom))
            const count = g.segments.reduce((t, s) => t + s.all.length, 0)
            return (
              <li key={g.univers}>
                <button type="button" onClick={() => toggle(g.univers)} aria-expanded={isOpen(g.univers)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-neutral-800/40">
                  <svg aria-hidden="true" className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${isOpen(g.univers) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{g.univers}</span>
                  <span className="text-[11px] text-gray-500 dark:text-neutral-400">{count} marque{count > 1 ? 's' : ''}</span>
                  {!editable && <span className="ml-auto h-5 px-1.5 inline-flex items-center rounded text-[10px] font-semibold bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">Lecture seule</span>}
                </button>
                {isOpen(g.univers) && (
                  <div className="px-4 pb-4 space-y-4">
                    {g.segments.map(({ seg, list, all }) => { const editable = canEditUnivers(user, g.univers, seg.nom); return (
                      <div key={seg.id} className="rounded-xl border border-gray-200 dark:border-neutral-800 p-3 space-y-2">
                        <p className="text-xs font-semibold text-gray-700 dark:text-neutral-200">
                          {seg.nom || 'Sans segment'} <span className="font-normal text-gray-500 dark:text-neutral-400">· {all.length}</span>
                        </p>
                        {list.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {list.map(b => <BrandChip key={b.id} brand={b} siblings={all} editable={editable} user={user} onError={setError} />)}
                          </div>
                        ) : <p className="text-[11px] text-gray-500 dark:text-neutral-400">Aucune marque.</p>}
                        {editable && <AddBrandForm seg={seg} brands={all} user={user} />}
                      </div>
                    ) })}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}
