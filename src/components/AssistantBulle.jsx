// Bulle de l'assistant vélo (rayon vélo et administrateur), sur toutes les pages : le vendeur pose
// une question, la réponse s'appuie sur les procédures du Drive et cite ses sources.
// La discussion reste en mémoire tant que l'appli est ouverte ; « Nouvelle discussion » la vide.
import { useEffect, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'
import { SUGGESTIONS, blocs } from '../lib/assistant'

const poser = httpsCallable(functions, 'assistantQuestion', { timeout: 70_000 })
const noter = httpsCallable(functions, 'assistantAvis')

const ICONE_BULLE = 'M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z'
const ICONE_FERMER = 'M6 18L18 6M6 6l12 12'
const ICONE_NOUVEAU = 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99'
const ICONE_ENVOYER = 'M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5'
const ICONE_DOC = 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z'

const Svg = ({ d, className = 'h-4 w-4', strokeWidth = 1.8 }) => (
  <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)

function Segments({ segments, sources }) {
  return segments.map((s, i) => {
    if (s.type === 'gras') return <strong key={i} className="font-semibold">{s.valeur}</strong>
    if (s.type === 'italique') return <em key={i}>{s.valeur}</em>
    if (s.type === 'source') {
      const src = sources.find(x => x.n === s.n)
      if (!src) return null
      return (
        <sup key={i} className="ml-0.5 text-[10px] font-semibold text-gray-500 dark:text-neutral-400" title={src.titre}>
          [{s.n}]
        </sup>
      )
    }
    return <span key={i}>{s.valeur}</span>
  })
}

function Reponse({ texte, sources }) {
  return (
    <div className="space-y-2">
      {blocs(texte).map((b, i) => {
        if (b.type === 'paragraphe') return <p key={i}><Segments segments={b.segments} sources={sources} /></p>
        const Liste = b.type === 'numeros' ? 'ol' : 'ul'
        return (
          <Liste key={i} start={b.debut} className={`${b.type === 'numeros' ? 'list-decimal' : 'list-disc'} pl-5 space-y-1`}>
            {b.elements.map((el, k) => <li key={k}><Segments segments={el} sources={sources} /></li>)}
          </Liste>
        )
      })}
    </div>
  )
}

function MessageAssistant({ m, onAvis }) {
  return (
    <div className="max-w-[92%] space-y-2">
      <div className={['rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm leading-relaxed',
        m.trouve === false
          ? 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200'
          : 'bg-gray-100 text-gray-900 dark:bg-neutral-800 dark:text-neutral-100'].join(' ')}>
        <Reponse texte={m.texte} sources={m.sources || []} />
      </div>
      {m.sources?.length > 0 && (
        <ul className="space-y-1" aria-label="Sources">
          {m.sources.map(s => (
            <li key={s.n}>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-start gap-1.5 text-xs text-gray-600 hover:text-gray-900 hover:underline dark:text-neutral-300 dark:hover:text-white">
                  <Svg d={ICONE_DOC} className="h-3.5 w-3.5 mt-px shrink-0" />
                  <span>[{s.n}] {s.titre}<span className="sr-only"> (ouvre le document dans un nouvel onglet)</span></span>
                </a>
              ) : (
                <span className="inline-flex items-start gap-1.5 text-xs text-gray-600 dark:text-neutral-300">
                  <Svg d={ICONE_DOC} className="h-3.5 w-3.5 mt-px shrink-0" />[{s.n}] {s.titre}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {m.id && (
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-neutral-400">
          <span className="mr-1">Réponse utile ?</span>
          {[['utile', '👍', 'Oui, réponse utile'], ['inutile', '👎', 'Non, réponse pas utile']].map(([valeur, emoji, label]) => (
            <button key={valeur} type="button" onClick={() => onAvis(m, m.avis === valeur ? null : valeur)}
              aria-pressed={m.avis === valeur} aria-label={label} title={label}
              className={['h-7 w-7 grid place-items-center rounded-lg transition-colors',
                m.avis === valeur ? 'bg-gray-900 dark:bg-white' : 'hover:bg-gray-100 dark:hover:bg-neutral-800'].join(' ')}>
              <span aria-hidden="true" className={m.avis && m.avis !== valeur ? 'opacity-40' : ''}>{emoji}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AssistantBulle() {
  const [ouvert, setOuvert] = useState(false)
  const [messages, setMessages] = useState([]) // { role: 'user' | 'assistant', texte, id?, sources?, trouve?, avis? }
  const [saisie, setSaisie] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState('')
  const [restantes, setRestantes] = useState(null)
  const bouton = useRef(null)
  const champ = useRef(null)
  const fil = useRef(null)

  // Ouverture : curseur dans le champ ; fermeture : retour sur la bulle
  useEffect(() => {
    if (ouvert) champ.current?.focus()
  }, [ouvert])

  useEffect(() => {
    fil.current?.scrollTo({ top: fil.current.scrollHeight, behavior: 'smooth' })
  }, [messages, enCours])

  function fermer() {
    setOuvert(false)
    setTimeout(() => bouton.current?.focus(), 0)
  }

  async function envoyer(texte = saisie) {
    const question = texte.trim()
    if (question.length < 3 || enCours) return
    const historique = messages.filter(m => m.texte).slice(-4).map(m => ({ role: m.role, texte: m.texte }))
    setMessages(ms => [...ms, { role: 'user', texte: question }])
    setSaisie(''); setErreur(''); setEnCours(true)
    try {
      const { data } = await poser({ question, historique })
      setMessages(ms => [...ms, { role: 'assistant', texte: data.reponse, id: data.id, sources: data.sources, trouve: data.trouve, avis: null }])
      setRestantes(data.restantes)
    } catch (err) {
      setErreur(err?.message && !/^internal$/i.test(err.message) ? err.message : 'L’assistant ne répond pas pour le moment. Réessaie dans un instant.')
      // La question non traitée revient dans le champ
      setMessages(ms => ms.slice(0, -1))
      setSaisie(question)
    } finally {
      setEnCours(false)
      champ.current?.focus()
    }
  }

  async function avis(m, valeur) {
    setMessages(ms => ms.map(x => x.id === m.id ? { ...x, avis: valeur } : x))
    try { await noter({ id: m.id, avis: valeur }) }
    catch { setMessages(ms => ms.map(x => x.id === m.id ? { ...x, avis: m.avis } : x)) }
  }

  function nouvelle() {
    setMessages([]); setErreur(''); setSaisie('')
    champ.current?.focus()
  }

  return (
    <>
      {!ouvert && (
        <button ref={bouton} type="button" onClick={() => setOuvert(true)} aria-label="Ouvrir l’assistant vélo" title="Assistant vélo"
          className="fixed bottom-4 right-4 z-[300] h-14 w-14 grid place-items-center rounded-full shadow-lg shadow-black/20 transition-transform hover:scale-105 bg-gray-900 text-white dark:bg-white dark:text-black print:hidden">
          <Svg d={ICONE_BULLE} className="h-6 w-6" />
        </button>
      )}

      {ouvert && (
        <div role="dialog" aria-modal="false" aria-labelledby="assistant-titre"
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); fermer() } }}
          className="fixed z-[300] inset-0 sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[400px] sm:h-[min(640px,calc(100dvh-2rem))] flex flex-col bg-white dark:bg-neutral-900 sm:rounded-2xl sm:border border-gray-200 dark:border-neutral-800 shadow-2xl print:hidden">
          {/* En-tête */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-neutral-800">
            <span className="h-9 w-9 grid place-items-center rounded-full bg-gray-900 text-white dark:bg-white dark:text-black shrink-0">
              <Svg d={ICONE_BULLE} className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-0">
              <h2 id="assistant-titre" className="text-sm font-semibold text-gray-900 dark:text-white">Assistant vélo</h2>
              <p className="text-[11px] text-gray-500 dark:text-neutral-400 truncate">Répond à partir des procédures du Drive</p>
            </div>
            {messages.length > 0 && (
              <button type="button" onClick={nouvelle} disabled={enCours} aria-label="Nouvelle discussion" title="Nouvelle discussion"
                className="h-8 w-8 grid place-items-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800">
                <Svg d={ICONE_NOUVEAU} />
              </button>
            )}
            <button type="button" onClick={fermer} aria-label="Fermer l’assistant" title="Fermer"
              className="h-8 w-8 grid place-items-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-800">
              <Svg d={ICONE_FERMER} strokeWidth={2} />
            </button>
          </div>

          {/* Discussion */}
          <div ref={fil} className="flex-1 overflow-y-auto px-4 py-4 space-y-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="max-w-[92%] rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm leading-relaxed bg-gray-100 text-gray-900 dark:bg-neutral-800 dark:text-neutral-100">
                  Salut ! Pose-moi une question sur les procédures du rayon cycle : SAV, transferts, packs, reprises… Je te réponds avec les documents du Drive.
                </div>
                <div className="flex flex-col items-start gap-2">
                  {SUGGESTIONS.map(s => (
                    <button key={s} type="button" onClick={() => envoyer(s)}
                      className="text-left text-xs px-3 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-tr-md px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap bg-gray-900 text-white dark:bg-white dark:text-black">
                  {m.texte}
                </p>
              </div>
            ) : (
              <MessageAssistant key={i} m={m} onAvis={avis} />
            ))}
            {enCours && (
              <p role="status" className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-neutral-400">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-neutral-700 dark:border-t-white animate-spin" />
                Recherche dans les procédures…
              </p>
            )}
            {erreur && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{erreur}</p>}
          </div>

          {/* Saisie */}
          <form onSubmit={e => { e.preventDefault(); envoyer() }} className="border-t border-gray-100 dark:border-neutral-800 p-3 space-y-1.5">
            <div className="flex items-end gap-2">
              <label htmlFor="assistant-question" className="sr-only">Ta question</label>
              <textarea ref={champ} id="assistant-question" rows={1} value={saisie} maxLength={500}
                onChange={e => setSaisie(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer() } }}
                placeholder="Ta question…"
                className="Input flex-1 resize-none min-h-[40px] max-h-32 py-2 text-base sm:text-sm"
                style={{ height: `${Math.min(128, 40 + 20 * (saisie.split('\n').length - 1))}px` }} />
              <button type="submit" disabled={enCours || saisie.trim().length < 3} aria-label="Envoyer la question" title="Envoyer"
                className="h-10 w-10 shrink-0 grid place-items-center rounded-xl bg-gray-900 text-white disabled:opacity-40 dark:bg-white dark:text-black">
                <Svg d={ICONE_ENVOYER} />
              </button>
            </div>
            <p className="text-[10px] text-gray-500 dark:text-neutral-400">
              L’IA peut se tromper : vérifie dans la procédure citée.{restantes != null && ` · ${restantes} question${restantes > 1 ? 's' : ''} restante${restantes > 1 ? 's' : ''} aujourd’hui`}
            </p>
          </form>
        </div>
      )}
    </>
  )
}
