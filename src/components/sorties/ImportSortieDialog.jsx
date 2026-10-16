// Import du fichier d'une semaine (extraction « DBG_AnalSynth ») : onglet, ligne d'en-tête et colonnes
// reconnues automatiquement, modifiables ; aperçu des totaux avant l'enregistrement.
import { useMemo, useState } from 'react'
import { BTN_PRIMARY, BTN_SECONDARY, Field, Modal, Notice } from '../admin/ui'
import { magasinMatcher, universMatcher } from '../../lib/budgets'
import { readWorkbook } from '../../lib/excel'
import { DIMS, MEASURES, RECEP, autoMapping, datasetTotals, findHeaderRow, missingMeasures, parseSortie } from '../../lib/sorties'
import { saveSemaineData } from '../../lib/sortiesStore'

const SELECT = 'w-full h-8 px-2 rounded-lg border text-xs bg-white dark:bg-neutral-950 border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white'
const n0 = v => Math.round(v).toLocaleString('fr-FR')

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 px-2.5 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">{label}</p>
      <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">{value}</p>
    </div>
  )
}

// target : { annee, semaine, label } ; magasins / univers : listes des budgets (rapprochement des libellés)
export default function ImportSortieDialog({ target, magasins, univers, user, onClose, onDone }) {
  const [wb, setWb] = useState(null)
  const [fileName, setFileName] = useState('')
  const [sheet, setSheet] = useState('')
  const [mapping, setMapping] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const rows = useMemo(() => (wb && sheet ? wb.rows(sheet) : null), [wb, sheet])
  const headerRow = useMemo(() => (rows ? findHeaderRow(rows) : -1), [rows])
  const header = rows && headerRow >= 0 ? rows[headerRow] : []

  function chooseSheet(name, w = wb) {
    setSheet(name)
    const r = w.rows(name)
    const h = findHeaderRow(r)
    setMapping(h >= 0 ? autoMapping(r[h]) : null)
  }

  async function read(file) {
    if (!file) return
    setBusy('Lecture du fichier…'); setError(''); setWb(null); setMapping(null)
    try {
      const w = await readWorkbook(file)
      setWb(w); setFileName(file.name)
      const first = w.sheetNames.find(n => findHeaderRow(w.rows(n)) >= 0) || w.sheetNames[0]
      chooseSheet(first, w)
    } catch (err) { setError(`Lecture impossible : ${err.message}`) }
    setBusy('')
  }

  // Libellés rapprochés des listes du groupe : « INTERSPORT LAVAL » → « LAVAL »
  const canon = useMemo(() => {
    const mag = magasinMatcher(magasins)
    const byId = new Map(magasins.map(m => [m.id, m.nom]))
    const uni = universMatcher(univers.map(u => u.nom))
    return {
      magasin: v => {
        const court = v.replace(/^INTERSPORT\s+/i, '')
        return byId.get(mag(court)) || byId.get(mag(v)) || court
      },
      univers: v => uni(v) || null,
    }
  }, [magasins, univers])

  const ds = useMemo(() => {
    if (!rows || headerRow < 0 || !mapping || missingMeasures(mapping).length) return null
    return parseSortie(rows, { headerRow, mapping, canon })
  }, [rows, headerRow, mapping, canon])
  const totals = ds ? datasetTotals(ds) : null
  const missing = mapping ? missingMeasures(mapping) : []

  async function save() {
    setBusy('Enregistrement…'); setError('')
    try {
      await saveSemaineData(target, ds, fileName, user)
      onDone?.()
      onClose()
    } catch (err) { setError(err.message); setBusy('') }
  }

  return (
    <Modal title={`Importer ${target.label}`} subtitle="Extraction des ventes et du stock (une ligne par référence, couleur et magasin)"
      size="max-w-2xl" onClose={busy ? () => {} : onClose}
      footer={<>
        {error && <p role="alert" className="mr-auto text-xs text-red-600 dark:text-red-400">{error}</p>}
        <button type="button" onClick={onClose} disabled={!!busy} className={BTN_SECONDARY}>Annuler</button>
        <button type="button" onClick={save} disabled={!ds || !ds.n || !!busy} className={BTN_PRIMARY}>
          {busy === 'Enregistrement…' ? busy : ds ? `Importer ${n0(ds.n)} lignes` : 'Importer'}
        </button>
      </>}>
      <Field label="Fichier Excel">
        <input type="file" accept=".xlsx,.xls,.xlsm,.csv" disabled={!!busy} onChange={e => read(e.target.files?.[0])}
          className="block w-full text-xs text-gray-700 dark:text-neutral-300 file:mr-3 file:h-8 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-900 file:text-white dark:file:bg-white dark:file:text-black" />
      </Field>
      {busy && <p className="text-xs text-gray-500 dark:text-neutral-400">{busy}</p>}
      {wb && <>
        {wb.sheetNames.length > 1 && (
          <Field label="Onglet">
            <select value={sheet} onChange={e => chooseSheet(e.target.value)} className={SELECT}>
              {wb.sheetNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        )}
        {headerRow < 0 ? (
          <Notice notice={{ text: 'En-tête introuvable : le fichier doit contenir les colonnes QtVte, QtStkFin, CANet, MtMrg et QtRecep.' }} />
        ) : mapping && <>
          <details open={missing.length > 0} className="rounded-xl border border-gray-200 dark:border-neutral-800 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-gray-700 dark:text-neutral-200">
              Colonnes reconnues {missing.length ? `· ${missing.length} mesure(s) à choisir` : '· vérifier ou modifier'}
            </summary>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[...MEASURES, ...DIMS, RECEP].map(f => (
                <label key={f.key} className="space-y-0.5">
                  <span className={`block text-[11px] font-semibold ${mapping[f.key] < 0 && MEASURES.includes(f) ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-neutral-300'}`}>{f.label}</span>
                  <select value={mapping[f.key]} onChange={e => setMapping(m => ({ ...m, [f.key]: Number(e.target.value) }))} className={SELECT}>
                    <option value={-1}>— Aucune —</option>
                    {header.map((h, j) => <option key={j} value={j}>{String(h || `Colonne ${j + 1}`)}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </details>
          {totals && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Stat label="Lignes" value={n0(ds.n)} />
              <Stat label="Magasins" value={ds.dims.magasin.length} />
              <Stat label="CANet" value={`${n0(totals.caNet)} €`} />
              <Stat label="MtMrg" value={`${n0(totals.mtMrg)} €`} />
              <Stat label="QtVte" value={n0(totals.qtVte)} />
              <Stat label="QtStkFin" value={n0(totals.qtStkFin)} />
              <Stat label="Dates de réception" value={ds.recep ? `${n0(ds.recep.filter(d => d >= 0).length)} lignes datées` : 'colonne absente'} />
            </div>
          )}
          {ds && <p className="text-[11px] text-gray-500 dark:text-neutral-400">Magasins : {ds.dims.magasin.join(', ')}{ds.skipped ? ` · ${ds.skipped} ligne(s) de total ignorée(s)` : ''}</p>}
        </>}
      </>}
      <p className="text-[11px] text-gray-500 dark:text-neutral-400">Un nouvel import remplace celui de la semaine.</p>
    </Modal>
  )
}
