// Imports d'un budget : base (« BASE BUDGET AH27 »), budget N-1 par marque (fichier Excel) et commandes
// fournisseur (export MesAchats) qui remplissent la saisie
import { useMemo, useState } from 'react'
import { BTN_PRIMARY, BTN_SECONDARY, Field, Modal, Notice } from '../admin/ui'
import { readWorkbook } from '../../lib/excel'
import {
  CIBLE_IGNORER, CIBLE_NOUVELLE, findN1Sheet, formatBudget, formatQte, magasinMatcher, mergeCommandes, n1Columns, parseBaseSheet, parseCommandeSheet,
  parseMoreSheet,
  parseN1Sheet, planCommande, planN1Import, previousSeason, seasonCode, sumValues,
} from '../../lib/budgets'
import { applyCommande, applyN1, saveBase } from '../../lib/budgetsStore'

const SELECT = 'w-full h-9 px-2 rounded-lg border text-sm bg-white dark:bg-neutral-950 border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white'

function FileField({ label, onFile, busy, multiple = false }) {
  return (
    <Field label={label} hint={busy ? 'Lecture…' : multiple ? 'Un ou plusieurs fichiers Excel (.xlsx)' : 'Fichier Excel (.xlsx)'}>
      <input type="file" accept=".xlsx,.xls,.xlsm" disabled={busy} multiple={multiple}
        onChange={e => e.target.files.length && onFile(multiple ? [...e.target.files] : e.target.files[0])}
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
    // « BUDGET AH26 » d'abord (un export de l'appli a aussi « ADAPTÉ AH26 » et « QTÉ AH26 »)
    setColumn(cols.find(c => c === `BUDGET ${prevCode}`) || cols.find(c => c.endsWith(prevCode)) || cols.at(-1) || '')
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
  // Tout le fichier est importé, quel que soit l'acheteur (le N-1 de tous les univers)
  const lines = parsed?.lines || null
  const plan = useMemo(() => (lines ? planN1Import(lines, brands, budget.segments) : null), [lines, brands, budget.segments])

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
          <Warning title="Segments absents de la base, ajoutés avec un budget de base à 0 :"
            items={plan.newSegments.map(s => `${s.univers} › ${s.nom || 'sans segment'}`)} />
          <Warning title="Magasins non reconnus (colonnes ignorées) : ajoute ce nom dans l’onglet Magasins." items={parsed.unknownMagasins} />
          <Warning title="Univers non reconnus (lignes ignorées) :" items={parsed.unknownUnivers} />
        </>}
      </>}
    </Modal>
  )
}

// Commandes fournisseur : chaque fichier remplit la saisie et les quantités des marques, dans les univers que
// l'utilisateur peut modifier. L'acheteur choisit d'où vient le fichier (FORMATS_COMMANDE) : un format de plus
// = une entrée de plus (lecture dans lib/budgets.js).
const FORMATS_COMMANDE = [
  {
    id: 'mesachats', label: 'MesAchats', hint: 'Une ligne par modèle et couleur, une colonne de pièces par magasin (« CDE ENERGETICS AH27 »).',
    lire: (rows, { univers, matchMagasin, fichier }) => parseCommandeSheet(rows, { univers, matchMagasin, fichier }),
  },
  {
    id: 'more', label: 'MORE (Bestseller)', hint: 'Jack & Jones, Name It, Only… Une ligne par article et taille, un fichier par magasin (« Order_53896835 »).',
    lire: (rows, { matchMagasin, fichier, magasinId }) => parseMoreSheet(rows, { matchMagasin, fichier, magasinId }),
  },
]
export function ImportCommandeDialog({ budget, brands, lines, univers, magasins, user, onClose }) {
  // Fichiers lus : { name, fichier, sheets: [lignes de chaque onglet] } ; magasin choisi à la main pour un
  // fichier MORE dont le compte n'est reconnu dans aucun magasin : { [name]: magId }
  const [files, setFiles] = useState([])
  const [format, setFormat] = useState('mesachats')
  const [magasinFichier, setMagasinFichier] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Quand une ligne de marque a déjà une saisie : la commande s'additionne (true) ou la remplace (false) ;
  // null tant que l'utilisateur n'a pas répondu
  const [ajouter, setAjouter] = useState(null)
  // Ligne du budget choisie à la main pour une ligne de l'aperçu : { [row.key]: id | CIBLE_NOUVELLE | CIBLE_IGNORER }
  const [choix, setChoix] = useState({})
  const [done, setDone] = useState(null)
  const notReady = listsMissing(univers, magasins)
  const magNom = useMemo(() => new Map(magasins.map(m => [m.id, m.nom])), [magasins])

  async function read(list) {
    setBusy(true); setError(''); setFiles([]); setChoix({}); setAjouter(null); setMagasinFichier({})
    const ok = [], errors = []
    for (const f of list) {
      try {
        const wb = await readWorkbook(f)
        ok.push({ name: f.name, fichier: f.name.replace(/\.[^.]+$/, ''), sheets: wb.sheetNames.map(n => wb.rows(n)) })
      } catch (err) { errors.push(`${f.name} : lecture impossible (${err.message})`) }
    }
    setFiles(ok)
    setError(errors.join('\n'))
    setBusy(false)
  }

  // Lecture de chaque fichier dans le format choisi (premier onglet lisible)
  const fmt = FORMATS_COMMANDE.find(f => f.id === format)
  const lus = useMemo(() => {
    const matchMagasin = magasinMatcher(magasins)
    return files.map(f => {
      const essais = f.sheets.map(rows => fmt.lire(rows, { univers: univers.map(u => u.nom), matchMagasin, fichier: f.fichier, magasinId: magasinFichier[f.name] || null }))
      const result = essais.find(x => !x.error && !(x.magasinManquant && !x.lines)) || essais.find(x => x.magasinManquant) || essais[0]
      const autre = FORMATS_COMMANDE.find(o => o.id !== fmt.id && f.sheets.some(rows => !o.lire(rows, { univers: univers.map(u => u.nom), matchMagasin, fichier: f.fichier }).error))
      return { ...f, result: result.error && autre ? { error: `${result.error} Ce fichier ressemble à un export ${autre.label} : choisis ce format en haut.` } : result }
    })
  }, [files, magasins, univers, magasinFichier, fmt])
  // Fichiers MORE dont le compte n'est pas reconnu (magasin à choisir), ou dont le magasin a été choisi à la main
  const sansMagasin = lus.filter(f => f.result.magasinManquant || magasinFichier[f.name])
  const magNomDe = id => magasins.find(m => m.id === id)?.nom || id
  // Fichiers MORE reconnus automatiquement : magasin retenu
  const moreAuto = lus.filter(f => f.result.format === 'MORE' && f.result.lines?.length && !magasinFichier[f.name])
  const erreurs = lus.filter(f => f.result.error).map(f => `${f.name} : ${f.result.error}`)
  const valides = lus.filter(f => f.result.lines?.length)
  const commande = useMemo(() => (valides.length ? mergeCommandes(valides.map(f => f.result)) : null), [valides])
  const plan = useMemo(() => (commande ? planCommande(commande, { brands, segments: budget.segments, budgetLines: lines, user, ajouter: ajouter === true, choix }) : null),
    [commande, brands, budget.segments, lines, user, ajouter, choix])
  // Lignes de marque visées qui ont déjà une saisie (montants ou quantités) : il faut savoir si la commande s'additionne
  const lineById = useMemo(() => new Map(lines.map(l => [l.id, l])), [lines])
  const dejaSaisies = plan ? plan.items.filter(it => it.id && (sumValues(lineById.get(it.id)?.saisie) || sumValues(lineById.get(it.id)?.quantite))) : []
  const aRepondre = dejaSaisies.length > 0 && ajouter === null
  // Montant de cette commande pour une ligne de marque (somme des lignes de l'aperçu qui y vont)
  const commandeDe = it => plan.rows.filter(r => r.item === it).reduce((t, r) => t + r.commande, 0)

  async function save() {
    setBusy(true)
    try { await applyCommande(budget, plan, user); setDone(plan) } catch (err) { setError(err.message) }
    setBusy(false)
  }

  const pris = plan ? plan.rows.filter(r => r.item) : []
  const montant = pris.reduce((t, r) => t + r.commande, 0)
  const pieces = pris.reduce((t, r) => t + r.pieces, 0)
  const TD = 'py-1 px-1.5 text-right tabular-nums whitespace-nowrap'
  const detail = map => commande.magIds.map(m => `${magNom.get(m)} : ${formatQte(map.quantite[m] || 0)} · ${formatBudget(map.saisie[m] || 0)}`).join('\n')
  return (
    <Modal title="Importer des commandes" subtitle={`${budget.nom} · remplit la saisie des marques`} size="max-w-5xl" onClose={onClose}
      footer={done ? <button type="button" onClick={onClose} className={BTN_PRIMARY}>Fermer</button> : <>
        {(plan?.aChoisir > 0 || aRepondre) && (
          <span className="mr-auto text-xs font-semibold text-amber-700 dark:text-amber-300">
            {plan.aChoisir > 0 ? `${plan.aChoisir} ligne(s) à choisir` : 'Dis si la commande s’additionne ou remplace'}
          </span>
        )}
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>Annuler</button>
        <button type="button" onClick={save} disabled={!plan?.items.length || plan.aChoisir > 0 || aRepondre || busy} className={BTN_PRIMARY}>{busy && plan ? 'Import…' : 'Remplir la saisie'}</button>
      </>}>
      {notReady ? <Notice notice={{ text: notReady }} /> : done ? (
        <Notice notice={{ tone: 'ok', text: `Saisie ${ajouter ? 'complétée (commande additionnée)' : 'remplie'} : ${done.items.length} ligne(s) de marque${done.items.some(i => i.nouvelle) ? `, dont ${done.items.filter(i => i.nouvelle).length} ajoutée(s) à la liste des marques` : ''}. Elles restent en prévisionnel : passe-les en engagé dans le tableau quand la commande est validée.` }} />
      ) : <>
        <div role="radiogroup" aria-label="D’où vient le fichier ?" className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400">D’où vient le fichier ?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {FORMATS_COMMANDE.map(f => (
              <button key={f.id} type="button" role="radio" aria-checked={format === f.id} onClick={() => { setFormat(f.id); setChoix({}); setAjouter(null) }}
                className={`text-left rounded-xl border px-3 py-2 ${format === f.id
                  ? 'border-gray-900 ring-1 ring-gray-900 dark:border-white dark:ring-white'
                  : 'border-gray-200 hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800'}`}>
                <span className="block text-sm font-semibold text-gray-900 dark:text-white">{f.label}</span>
                <span className="block text-[11px] text-gray-500 dark:text-neutral-400 leading-snug">{f.hint}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-gray-600 dark:text-neutral-300 leading-relaxed space-y-1">
          <p>
            Pour chaque marque et chaque magasin : <strong>quantité = pièces commandées</strong>, <strong>montant = pièces × prix d’achat net</strong>
            {format === 'mesachats' ? ' (« PA net saisi » s’il est rempli, sinon PAJA moins la remise).' : ' (« Prix net unitaire »).'}
          </p>
          <p>
            {format === 'mesachats'
              ? 'Quand le budget a plusieurs lignes pour la marque dans un segment (« ENERGETICS FEMME », « NIKE Q3 »…), chaque article va dans celle qui correspond à sa famille, sous-famille, gamme ou au nom du fichier ; sinon dans la marque seule.'
              : 'Le fichier ne donne ni univers ni segment : la ligne de budget est cherchée parmi les marques de ce nom, d’après le genre (Homme, Femme…), la catégorie, la sous-marque et NOOS. Le magasin est reconnu par le nom du compte MORE dans les autres noms du magasin.'}
            {' '}Vérifie la colonne « Ligne du budget » et change-la au besoin.
          </p>
          <p>Les marques restent en <strong>prévisionnel</strong>. Tu peux choisir plusieurs fichiers d’un coup.</p>
        </div>
        <FileField label="Fichiers de commande" onFile={read} busy={busy && !plan} multiple />
        {(error || erreurs.length > 0) && <Notice notice={{ text: [error, ...erreurs].filter(Boolean).join('\n') }} />}
        {moreAuto.map(f => (
          <p key={f.name} className="text-xs text-gray-700 dark:text-neutral-200">
            <strong>{f.name}</strong> : magasin <strong>{f.result.magIds.map(magNomDe).join(', ')}</strong>
            {f.result.comptes?.[0]?.nom && ` (compte MORE « ${f.result.comptes[0].nom} »)`}
          </p>
        ))}
        {sansMagasin.map(f => {
          const compte = f.result.magasinManquant || f.result.comptes?.[0] || {}
          const aChoisir = !magasinFichier[f.name]
          return (
          <div key={f.name} role={aChoisir ? 'alert' : undefined} className={`rounded-xl border px-3 py-2.5 text-xs space-y-2 ${aChoisir
            ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100'
            : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-neutral-700 dark:bg-neutral-800/40 dark:text-neutral-200'}`}>
            <p>
              <strong>{f.name}</strong> : le compte MORE <strong>{compte.id}</strong> « {compte.nom} » n’est reconnu dans aucun magasin.
              {aChoisir ? ' Choisis le magasin de cette commande.' : ''} Pour que ce soit automatique la prochaine fois, ajoute
              « {compte.nom} » dans les autres noms du magasin (Budgets › Magasins).
            </p>
            <select value={magasinFichier[f.name] || ''} onChange={e => setMagasinFichier(m => ({ ...m, [f.name]: e.target.value }))}
              aria-label={`Magasin de la commande ${f.name}`} className={`${SELECT} max-w-xs`}>
              <option value="">Choisir le magasin…</option>
              {magasins.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </div>
          )
        })}
        {plan && <>
          {dejaSaisies.length > 0 && (
            <div role={aRepondre ? 'alert' : undefined} className={`rounded-xl border px-3 py-2.5 text-xs space-y-2 ${aRepondre
              ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100'
              : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-neutral-700 dark:bg-neutral-800/40 dark:text-neutral-200'}`}>
              <p className="font-semibold">
                {dejaSaisies.length} ligne(s) de marque ont déjà une saisie. Cette commande s’additionne-t-elle à ce qui est déjà saisi ?
              </p>
              <ul className="space-y-0.5">
                {dejaSaisies.slice(0, 8).map(it => {
                  const avant = sumValues(lineById.get(it.id)?.saisie)
                  const cmd = commandeDe(it)
                  return (
                    <li key={it.tKey} className="tabular-nums">
                      <strong>{it.identity.nom}</strong> ({it.identity.univers} › {it.identity.segment || 'sans segment'}) : déjà {formatBudget(avant)},
                      cette commande {formatBudget(cmd)} → <strong>{formatBudget(avant + cmd)}</strong> si on additionne, {formatBudget(cmd)} si elle remplace
                    </li>
                  )
                })}
                {dejaSaisies.length > 8 && <li>… et {dejaSaisies.length - 8} autre(s).</li>}
              </ul>
              <div role="radiogroup" aria-label="La commande s’additionne ou remplace" className="flex flex-wrap gap-2">
                {[[true, 'Oui, elle s’additionne', 'commande en plus : on ajoute pièces et montants'],
                  [false, 'Non, elle remplace', 'nouvelle version de la même commande']].map(([v, label, hint]) => (
                  <button key={label} type="button" role="radio" aria-checked={ajouter === v} onClick={() => setAjouter(v)}
                    className={`px-3 py-1.5 rounded-lg border text-left ${ajouter === v
                      ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white'
                      : 'bg-white border-gray-300 text-gray-800 hover:bg-gray-100 dark:bg-neutral-900 dark:border-neutral-600 dark:text-neutral-200'}`}>
                    <span className="block font-semibold">{label}</span>
                    <span className="block text-[10px] opacity-80">{hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Fichiers" value={valides.length} />
            <Stat label="Lignes de marque" value={plan.items.length} />
            <Stat label="Pièces" value={formatQte(pieces)} />
            <Stat label="Montant (prix d’achat)" value={formatBudget(montant)} />
          </div>
          {plan.rows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-neutral-800">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-neutral-400">
                  <tr className="border-b border-gray-200 dark:border-neutral-800">
                    <th scope="col" className="py-1.5 px-1.5 text-left">Univers › Segment</th>
                    <th scope="col" className="py-1.5 px-1.5 text-left">Fichier : marque · familles</th>
                    <th scope="col" className="py-1.5 px-1.5 text-right">Pièces</th>
                    <th scope="col" className="py-1.5 px-1.5 text-right">Commande</th>
                    <th scope="col" className="py-1.5 px-1.5 text-left">Ligne du budget</th>
                    <th scope="col" className="py-1.5 px-1.5 text-right">Saisi avant → après</th>
                  </tr>
                </thead>
                <tbody className="text-gray-900 dark:text-white">
                  {plan.rows.map(r => {
                    const exacte = r.options.some(b => b.nom.toUpperCase() === r.nom)
                    return (
                      <tr key={r.key} className={`border-t border-gray-100 dark:border-neutral-800 align-top ${r.cible ? '' : 'bg-amber-50 dark:bg-amber-500/10'}`}>
                        <td className="py-1 px-1.5">{r.global && !r.univers ? '—' : `${r.univers} › ${r.segment || 'sans segment'}`}</td>
                        <td className="py-1 px-1.5" title={detail(r)}>
                          <span className="font-semibold">{r.nom}</span>
                          {r.familles.length > 0 && <span className="block text-[10px] text-gray-500 dark:text-neutral-400">{r.familles.slice(0, 4).join(', ')}{r.familles.length > 4 ? `… (+${r.familles.length - 4})` : ''}</span>}
                        </td>
                        <td className={TD}>{formatQte(r.pieces)}</td>
                        <td className={TD}>{formatBudget(r.commande)}</td>
                        <td className="py-1 px-1.5">
                          <select value={r.cible} onChange={e => setChoix(c => ({ ...c, [r.key]: e.target.value }))}
                            aria-label={`Ligne du budget pour ${r.nom} (${r.univers} › ${r.segment || 'sans segment'})`}
                            className={`${SELECT} !h-8 !text-xs min-w-[11rem] ${r.cible ? '' : '!border-amber-400'}`}>
                            {!r.cible && <option value="">— À choisir —</option>}
                            {r.options.map(b => <option key={b.id} value={b.id}>{r.global ? `${b.nom} (${b.univers} › ${b.segment || 'sans segment'})` : b.nom}</option>)}
                            {!exacte && !r.global && <option value={CIBLE_NOUVELLE}>Nouvelle marque « {r.nom} »</option>}
                            <option value={CIBLE_IGNORER}>Ne pas importer</option>
                          </select>
                        </td>
                        <td className={TD} title={r.item ? detail({ saisie: r.item.saisie, quantite: r.item.quantite }) : undefined}>
                          {r.item ? <>
                            <span className="text-gray-500 dark:text-neutral-400">{r.item.avant ? formatBudget(r.item.avant) : '—'} → </span>
                            <span className="font-semibold">{formatBudget(r.item.apres)}</span>
                          </> : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Warning title="Univers que tu ne peux pas modifier (lignes ignorées) :" items={plan.horsDroits} />
          <Warning title="Marques absentes des budgets (lignes ignorées) : ajoute-les dans l’onglet Marques puis réimporte." items={plan.absentes} />
          <Warning title="Segments absents du budget, ajoutés avec un budget de base à 0 :"
            items={plan.newSegments.map(s => `${s.univers} › ${s.nom || 'sans segment'}`)} />
          <Warning title="Magasins non reconnus (colonnes ignorées) : ajoute ce code dans l’onglet Magasins puis réimporte." items={commande.unknownMagasins} />
          <Warning title="Univers non reconnus (lignes ignorées) :" items={commande.unknownUnivers} />
          <Warning title="Lignes sans prix d’achat (comptées dans les pièces, pas dans le montant) :" items={commande.sansPrix} />
          <Warning title="Lignes dont le Total ne correspond pas à la somme des magasins (les magasins sont pris) :" items={commande.ecartsTotal} />
        </>}
      </>}
    </Modal>
  )
}
