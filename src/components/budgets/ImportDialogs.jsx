// Imports d'un budget : base (« BASE BUDGET AH27 ») et budget N-1 par marque (fichier Excel)
import { useMemo, useState } from 'react'
import { BTN_PRIMARY, BTN_SECONDARY, Field, Modal, Notice } from '../admin/ui'
import { readWorkbook } from '../../lib/excel'
import {
  editableLines, findN1Sheet, formatBudget, magasinMatcher, n1Columns, parseBaseSheet, parseN1Sheet, planN1Import, previousSeason,
  seasonCode, sumValues,
} from '../../lib/budgets'
import { applyN1, saveBase } from '../../lib/budgetsStore'

const SELECT = 'w-full h-9 px-2 rounded-lg border text-sm bg-white dark:bg-neutral-950 border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white'

function FileField({ label, onFile, busy }) {
  return (
    <Field label={label} hint={busy ? 'Lecture du fichier…' : 'Fichier Excel (.xlsx)'}>
      <input type="file" accept=".xlsx,.xls,.xlsm" disabled={busy}
        onChange={e => e.target.files[0] && onFile(e.target.files[0])}
        className="block w-full text-xs text-gray-700 dark:text-neutral-300 file:mr-3 file:h-8 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-800 dark:file:bg-neutral-800 dark:file:text-neutral-200" />
    </Field>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 px-3 py-2">
      <p className="text-[11px] text-gray-500 dark:text-neutral-400">{label}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{value}</p>
    </div>
  )
}

function Warning({ title, items }) {
  if (!items?.length) return null
  return (
    <div role="alert" className="rounded-xl border px-3 py-2.5 text-xs text-amber-800 bg-amber-50 border-amber-200 dark:text-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 leading-relaxed">{items.join(' · ')}</p>
    </div>
  )
}

function listsMissing(univers, magasins) {
  if (!univers.length) return 'La liste des univers est vide : remplis-la dans l’onglet Univers des budgets.'
  if (!magasins.length) return 'La liste des magasins est vide : remplis-la dans l’onglet Magasins des budgets.'
  return null
}

export function ImportBaseDialog({ budget, univers, magasins, user, onClose }) {
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const notReady = listsMissing(univers, magasins)

  async function read(f) {
    setBusy(true); setError(''); setResult(null)
    try {
      const wb = await readWorkbook(f)
      const r = parseBaseSheet(wb.rows(wb.sheetNames[0]), {
        univers: univers.map(u => u.nom), matchMagasin: magasinMatcher(magasins),
      })
      if (r.error) setError(r.error)
      else { setResult(r); setFile(f) }
    } catch (err) { setError(`Lecture impossible : ${err.message}`) }
    setBusy(false)
  }

  async function save() {
    setBusy(true)
    try { await saveBase(budget, result, file.name, user); onClose() } catch (err) { setError(err.message); setBusy(false) }
  }

  const total = result ? Object.values(result.base).reduce((t, m) => t + sumValues(m), 0) : 0
  return (
    <Modal title="Importer la base" subtitle={budget.nom} size="max-w-lg" onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
        <button type="button" onClick={save} disabled={!result || busy} className={BTN_PRIMARY}>{busy && result ? 'Import…' : 'Importer'}</button>
      </>}>
      {notReady ? <Notice notice={{ text: notReady }} /> : <>
        <p className="text-xs text-gray-600 dark:text-neutral-300 leading-relaxed">
          Colonnes lues : <strong>Univers</strong>, <strong>Magasin</strong> et <strong>Budget détail marques</strong>.
          {budget.baseImport && ' Le budget de base actuel est remplacé ; les marques et la saisie sont conservées.'}
        </p>
        <FileField label="Fichier de base" onFile={read} busy={busy && !result} />
        {error && <Notice notice={{ text: error }} />}
        {result && <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Univers" value={result.stats.univers} />
            <Stat label="Segments" value={result.stats.segments} />
            <Stat label="Lignes" value={result.stats.lignes.toLocaleString('fr-FR')} />
            <Stat label="Budget de base" value={formatBudget(total)} />
          </div>
          <Warning title="Magasins non reconnus (lignes ignorées) : ajoute leur code dans l’onglet Magasins puis réimporte."
            items={result.unknownMagasins} />
          {result.orphans > 0 && <Warning title="Lignes ignorées" items={[`${result.orphans} ligne(s) avant le premier univers reconnu`]} />}
        </>}
      </>}
    </Modal>
  )
}

export function ImportN1Dialog({ budget, brands, univers, magasins, user, onClose }) {
  const [wb, setWb] = useState(null)
  const [sheet, setSheet] = useState('')
  const [column, setColumn] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const notReady = listsMissing(univers, magasins)
  const matchMagasin = useMemo(() => magasinMatcher(magasins), [magasins])
  const prevCode = seasonCode(previousSeason(budget).saison, previousSeason(budget).annee)

  const rows = useMemo(() => (wb && sheet ? wb.rows(sheet) : null), [wb, sheet])
  const columns = useMemo(() => (rows ? n1Columns(rows, matchMagasin) : []), [rows, matchMagasin])

  function chooseSheet(name, w = wb) {
    setSheet(name)
    const cols = name ? n1Columns(w.rows(name), matchMagasin) : []
    setColumn(cols.find(c => c.endsWith(prevCode)) || cols.at(-1) || '')
  }

  async function read(f) {
    setBusy(true); setError(''); setWb(null)
    try {
      const w = await readWorkbook(f)
      setWb(w)
      chooseSheet(findN1Sheet(w.sheetNames) || '', w)
    } catch (err) { setError(`Lecture impossible : ${err.message}`) }
    setBusy(false)
  }

  const parsed = useMemo(() => (rows && column
    ? parseN1Sheet(rows, { univers: univers.map(u => u.nom), matchMagasin, column }) : null), [rows, column, univers, matchMagasin])
  const lines = useMemo(() => (parsed?.lines ? editableLines(parsed.lines, user) : null), [parsed, user])
  const plan = useMemo(() => (lines ? planN1Import(lines, brands, budget.segments) : null), [lines, brands, budget.segments])
  const ignored = parsed?.lines ? parsed.lines.length - lines.length : 0

  async function save() {
    setBusy(true)
    try {
      await applyN1(budget, brands, parsed.lines, `Excel · ${column}`, user)
      setDone(plan)
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  const total = lines ? lines.reduce((t, l) => t + sumValues(l.n1), 0) : 0
  return (
    <Modal title="Importer le N-1" subtitle={`${budget.nom} · budget ${prevCode} par marque`} size="max-w-lg" onClose={onClose}
      footer={done ? <button type="button" onClick={onClose} className={BTN_PRIMARY}>Fermer</button> : <>
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
        <button type="button" onClick={save} disabled={!plan || busy} className={BTN_PRIMARY}>{busy && plan ? 'Import…' : 'Importer'}</button>
      </>}>
      {notReady ? <Notice notice={{ text: notReady }} /> : done ? (
        <Notice notice={{ tone: 'ok', text: `N-1 importé : ${done.matched.length + done.missing.length} marque(s), dont ${done.missing.length} ajoutée(s) à la liste des marques${done.newSegments.length ? ` ; ${done.newSegments.length} segment(s) ajouté(s)` : ''}.` }} />
      ) : <>
        <p className="text-xs text-gray-600 dark:text-neutral-300 leading-relaxed">
          Fichier du budget précédent (onglet « BUDGET PAR MARQUES »). Les marques absentes de la liste des marques y sont
          ajoutées ; le N-1 est remplacé, la saisie n’est pas touchée.
        </p>
        <FileField label="Fichier du budget N-1" onFile={read} busy={busy && !wb} />
        {error && <Notice notice={{ text: error }} />}
        {wb && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Onglet">
              <select value={sheet} onChange={e => chooseSheet(e.target.value)} className={SELECT}>
                <option value="">Choisir…</option>
                {wb.sheetNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Colonne N-1" hint={sheet && !columns.length ? 'Aucun magasin reconnu dans cet onglet' : undefined}>
              <select value={column} onChange={e => setColumn(e.target.value)} disabled={!columns.length} className={SELECT}>
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
        )}
        {parsed?.error && <Notice notice={{ text: parsed.error }} />}
        {plan && <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Magasins" value={parsed.magasins} />
            <Stat label="Marques" value={plan.matched.length + plan.missing.length} />
            <Stat label="Nouvelles marques" value={plan.missing.length} />
            <Stat label="Total N-1" value={formatBudget(total)} />
          </div>
          {ignored > 0 && (
            <Notice notice={{ tone: 'ok', text: `${ignored} ligne(s) d’autres univers ignorées : seuls tes univers attitrés sont importés.` }} />
          )}
          <Warning title="Segments absents de la base, ajoutés avec un budget de base à 0 :"
            items={plan.newSegments.map(s => `${s.univers} › ${s.nom || 'sans segment'}`)} />
          <Warning title="Magasins non reconnus (colonnes ignorées) : ajoute ce nom dans l’onglet Magasins." items={parsed.unknownMagasins} />
          <Warning title="Univers non reconnus (lignes ignorées) :" items={parsed.unknownUnivers} />
        </>}
      </>}
    </Modal>
  )
}
