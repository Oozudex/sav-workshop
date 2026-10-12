// Onglet « Assistant » de l'administration : procédures lues sur le Drive (mise à jour à la demande),
// questions des vendeurs des 30 derniers jours (sans le compte), avis et coût estimé.
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../lib/firebase'
import { coutEstime } from '../../lib/assistant'
import { toMs } from '../../lib/todos'
import { BTN_PRIMARY, EmptyState, Notice, Section } from './ui'

const mettreAJour = httpsCallable(functions, 'assistantMiseAJour', { timeout: 1_800_000 })

const fmt = v => {
  const ms = toMs(v)
  return ms ? new Date(ms).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
}

function Chiffre({ label, valeur, ton }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-neutral-800/60 px-3 py-2.5">
      <p className="text-[11px] text-gray-500 dark:text-neutral-400">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${ton || 'text-gray-900 dark:text-white'}`}>{valeur}</p>
    </div>
  )
}

function EtatDrive() {
  const [etat, setEtat] = useState(null)
  const [problemes, setProblemes] = useState([])
  const [voirProblemes, setVoirProblemes] = useState(false)
  const [notice, setNotice] = useState(null)
  const [lance, setLance] = useState(false)

  useEffect(() => onSnapshot(doc(db, 'assistant_etat', 'indexation'), s => setEtat(s.exists() ? s.data() : null), () => setEtat(null)), [])
  useEffect(() => onSnapshot(query(collection(db, 'assistant_fichiers'), where('statut', 'in', ['ignore', 'erreur'])),
    s => setProblemes(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.titre || '').localeCompare(b.titre || ''))),
    () => setProblemes([])), [])

  const enCours = lance || etat?.enCours
  const bilan = etat?.bilan

  async function lancer() {
    setLance(true); setNotice(null)
    try {
      const { data } = await mettreAJour()
      setNotice(data?.dejaEnCours
        ? { tone: 'ok', text: 'Une mise à jour est déjà en cours.' }
        : { tone: 'ok', text: `Mise à jour terminée : ${data.lus} document${data.lus > 1 ? 's' : ''} relu${data.lus > 1 ? 's' : ''}, ${data.inchanges} inchangé${data.inchanges > 1 ? 's' : ''}.` })
    } catch (err) {
      // Délai dépassé côté navigateur : la mise à jour continue sur le serveur, l'état se met à jour seul
      if (/deadline/i.test(err?.code || '')) setNotice({ tone: 'ok', text: 'La mise à jour continue en arrière-plan.' })
      else setNotice({ tone: 'error', text: err?.message || 'La mise à jour a échoué.' })
    } finally { setLance(false) }
  }

  return (
    <Section title="Procédures lues" hint="Dossiers Drive lus par l’assistant : relus chaque nuit à 2 h 30 (seulement les documents modifiés)."
      action={<button type="button" onClick={lancer} disabled={enCours} className={BTN_PRIMARY}>{enCours ? 'Mise à jour…' : 'Mettre à jour maintenant'}</button>}>
      <div className="p-4 space-y-3">
        <Notice notice={notice} onClose={() => setNotice(null)} />
        {etat?.enCours && etat.progression && (
          <p role="status" className="text-xs text-gray-600 dark:text-neutral-300">
            Lecture en cours : {etat.progression.faits} / {etat.progression.total} documents…
          </p>
        )}
        {etat?.erreur && !etat.enCours && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">Dernière mise à jour interrompue : {etat.erreur}</p>
        )}
        {bilan ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Chiffre label="Documents dans le Drive" valeur={bilan.fichiers} />
            <Chiffre label="Passages consultables" valeur={bilan.passages} />
            <Chiffre label="Ignorés" valeur={bilan.ignores} ton={bilan.ignores ? 'text-amber-700 dark:text-amber-400' : undefined} />
            <Chiffre label="En erreur" valeur={bilan.erreurs} ton={bilan.erreurs ? 'text-red-600 dark:text-red-400' : undefined} />
          </div>
        ) : !etat?.enCours && (
          <p className="text-xs text-gray-500 dark:text-neutral-400">Les procédures n’ont pas encore été lues : lance une mise à jour.</p>
        )}
        {etat?.fin && <p className="text-[11px] text-gray-500 dark:text-neutral-400">Dernière mise à jour : {fmt(etat.fin)}</p>}
        {problemes.length > 0 && (
          <div>
            <button type="button" onClick={() => setVoirProblemes(v => !v)} aria-expanded={voirProblemes}
              className="text-xs font-semibold text-gray-700 hover:underline dark:text-neutral-200">
              {voirProblemes ? 'Masquer' : 'Voir'} les {problemes.length} document{problemes.length > 1 ? 's' : ''} non lu{problemes.length > 1 ? 's' : ''}
            </button>
            {voirProblemes && (
              <ul className="mt-2 divide-y divide-gray-100 dark:divide-neutral-800 text-xs">
                {problemes.map(p => (
                  <li key={p.id} className="py-1.5 flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-3">
                    {p.url
                      ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-800 hover:underline dark:text-neutral-200 truncate">{p.titre}</a>
                      : <span className="font-medium text-gray-800 dark:text-neutral-200 truncate">{p.titre}</span>}
                    <span className={p.statut === 'erreur' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-neutral-400'}>{p.raison}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Section>
  )
}

const FILTRES = [['toutes', 'Toutes'], ['sans', 'Sans réponse'], ['negatif', 'Avis 👎'], ['positif', 'Avis 👍']]

function Questions() {
  const [questions, setQuestions] = useState(null)
  const [filtre, setFiltre] = useState('toutes')
  const [ouverte, setOuverte] = useState(null)

  useEffect(() => onSnapshot(query(collection(db, 'assistant_questions'), orderBy('creeLe', 'desc'), limit(1000)),
    s => setQuestions(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setQuestions([])), [])

  const liste = useMemo(() => questions || [], [questions])
  const stats = useMemo(() => {
    const mois = new Date().toISOString().slice(0, 7)
    return {
      total: liste.length,
      sans: liste.filter(q => !q.trouve).length,
      positifs: liste.filter(q => q.avis === 'utile').length,
      negatifs: liste.filter(q => q.avis === 'inutile').length,
      cout: coutEstime(liste.filter(q => (q.jour || '').startsWith(mois))),
    }
  }, [liste])
  const affichees = liste.filter(q => filtre === 'toutes' || (filtre === 'sans' && !q.trouve)
    || (filtre === 'negatif' && q.avis === 'inutile') || (filtre === 'positif' && q.avis === 'utile'))

  return (
    <Section title="Questions des vendeurs" count={questions ? liste.length : null}
      hint="30 derniers jours, sans le nom du compte. « Sans réponse » = procédure à écrire ou à clarifier.">
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Chiffre label="Questions (30 j)" valeur={stats.total} />
          <Chiffre label="Sans réponse" valeur={stats.sans} ton={stats.sans ? 'text-amber-700 dark:text-amber-400' : undefined} />
          <Chiffre label="Avis 👍 / 👎" valeur={`${stats.positifs} / ${stats.negatifs}`} />
          <Chiffre label="Coût ce mois-ci" valeur={`≈ ${stats.cout < 0.01 ? '0' : stats.cout.toFixed(2).replace('.', ',')} €`} />
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer les questions">
          {FILTRES.map(([cle, label]) => (
            <button key={cle} type="button" onClick={() => setFiltre(cle)} aria-pressed={filtre === cle}
              className={['h-7 px-2.5 rounded-lg text-xs font-semibold border transition-colors', filtre === cle
                ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-black dark:border-white'
                : 'text-gray-600 border-gray-200 hover:bg-gray-50 dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-800'].join(' ')}>
              {label}
            </button>
          ))}
        </div>

        {questions === null ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400 py-6 text-center">Chargement…</p>
        ) : affichees.length === 0 ? (
          <EmptyState title="Aucune question" text={filtre === 'toutes' ? 'Les questions posées à l’assistant apparaîtront ici.' : 'Aucune question pour ce filtre.'} />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
            {affichees.map(q => (
              <li key={q.id} className="py-2">
                <button type="button" onClick={() => setOuverte(o => o === q.id ? null : q.id)} aria-expanded={ouverte === q.id}
                  className="w-full flex items-start gap-3 text-left">
                  <span className="text-[11px] text-gray-500 dark:text-neutral-400 w-24 shrink-0 pt-0.5">{fmt(q.creeLe)}</span>
                  <span className="flex-1 min-w-0 text-sm text-gray-900 dark:text-white">{q.question}</span>
                  <span className="shrink-0 text-xs" aria-hidden="true">
                    {!q.trouve && <span className="text-amber-600" title="Sans réponse">●</span>}
                    {q.avis === 'utile' && '👍'}{q.avis === 'inutile' && '👎'}
                  </span>
                </button>
                {ouverte === q.id && (
                  <div className="mt-2 sm:pl-[6.75rem] space-y-1.5">
                    <p className="text-xs leading-relaxed whitespace-pre-wrap text-gray-700 dark:text-neutral-300 rounded-lg bg-gray-50 dark:bg-neutral-800/60 px-3 py-2">{q.reponse}</p>
                    {q.sources?.length > 0 && <p className="text-[11px] text-gray-500 dark:text-neutral-400">Sources : {q.sources.join(' · ')}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

export default function AssistantPanel() {
  return (
    <div className="space-y-4">
      <EtatDrive />
      <Questions />
    </div>
  )
}
