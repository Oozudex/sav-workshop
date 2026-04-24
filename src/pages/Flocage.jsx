import { useEffect, useState, useMemo } from 'react'
import Navbar from '../components/Navbar'
import { useAuth } from '../store/useAuth'
import { useMagasin } from '../store/useMagasin'
import { db } from '../lib/firebase'
import {
  collection, onSnapshot, query, where, orderBy, collectionGroup,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, increment, setDoc, getDocs,
} from 'firebase/firestore'
import { GLOBAL_ROLES } from '../lib/constants'

/* ── Constants ──────────────────────────────────────────────────────────── */
const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const CHIFFRES = '0123456789'.split('')

const TAILLE_TYPES = [
  { key: 'grande_lettre_blanc', label: 'Grande lettre — Contour Noir', chars: LETTRES },
  { key: 'grande_lettre_noir', label: 'Grande lettre — Contour Blanc', chars: LETTRES },
  { key: 'petite_lettre', label: 'Petite lettre', chars: LETTRES },
  { key: 'gros_numero_blanc', label: 'Gros numéro — Contour Noir', chars: CHIFFRES },
  { key: 'gros_numero_noir', label: 'Gros numéro — Contour Blanc', chars: CHIFFRES },
  { key: 'petit_numero_blanc', label: 'Petit numéro — Contoir Noir', chars: CHIFFRES },
  { key: 'petit_numero_noir', label: 'Petit numéro — Contour Blanc', chars: CHIFFRES },
]

const TAILLE_COLORS = {
  grande_lettre_blanc: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  grande_lettre_noir: 'bg-blue-200 text-blue-900 dark:bg-blue-500/30 dark:text-blue-200',
  petite_lettre: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  gros_numero_blanc: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  gros_numero_noir: 'bg-violet-200 text-violet-900 dark:bg-violet-500/30 dark:text-violet-200',
  petit_numero_blanc: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
  petit_numero_noir: 'bg-purple-200 text-purple-900 dark:bg-purple-500/30 dark:text-purple-200',
}

/* ── Print ──────────────────────────────────────────────────────────────── */
function printCommande(c, magasinNom = 'Intersport') {
  const haut = c.lignes?.find(l => l.position === 'haut')
  const numero = c.lignes?.find(l => l.position === 'numero')
  const bas = c.lignes?.find(l => l.position === 'bas')
  const devant = c.lignes?.find(l => l.position === 'devant_coeur')
  const devantCentre = c.lignes?.find(l => l.position === 'devant_centre')

  const hasNom = !!(haut?.texte || bas?.texte)
  const hasNumero = !!numero?.texte
  const hasPhrase = !!(haut?.texte?.split(' ').length >= 4 || bas?.texte?.split(' ').length >= 4)
  const hasInitiales = !!(devant?.texte && devant.texte.length <= 3)
  const isOfficiel = c.officiel

  function chk(v) { return `<span style="display:inline-block;width:12px;height:12px;border:1.5px solid #333;border-radius:2px;margin-right:5px;vertical-align:middle;background:${v ? '#1d4ed8' : 'white'}"></span>` }

  // Génère un <text> SVG avec retour à la ligne automatique via <tspan>
  function svgText(text, x, y, fontSize, attrs = '') {
    const maxChars = Math.floor(140 / fontSize)
    const words = text.split(' ')
    const lines = []
    let cur = ''
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w
      if (test.length > maxChars && cur) { lines.push(cur); cur = w }
      else cur = test
    }
    if (cur) lines.push(cur)
    const lineH = fontSize * 1.25
    const tspans = lines.map((l, i) => `<tspan x="${x}" y="${y + i * lineH}">${l}</tspan>`).join('')
    return `<text text-anchor="middle" font-family="Arial" ${attrs}>${tspans}</text>`
  }

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<title>Flocage – ${c.clientNom}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',Arial,sans-serif;font-size:11px;color:#111;background:#fff;padding:20px 24px;max-width:680px;margin:0 auto}
  h1{font-size:28px;font-weight:900;letter-spacing:2px;color:#1d2d8a;text-transform:uppercase;margin-bottom:2px}
  .brand{font-size:11px;font-weight:700;color:#e63022;letter-spacing:3px;text-transform:uppercase;margin-bottom:16px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:0}
  .left{padding-right:20px;border-right:1px solid #ccc}
  .right{padding-left:20px}
  .field{border-bottom:1px dotted #999;min-height:20px;margin-bottom:3px;padding-bottom:1px;display:flex;align-items:flex-end}
  .field-label{font-size:9.5px;font-weight:600;color:#444;margin-bottom:2px;display:block}
  .field-value{font-size:12px;font-weight:600;color:#111;flex:1}
  .section-title{font-weight:700;font-size:10.5px;text-decoration:underline;margin:12px 0 6px}
  .row{display:flex;align-items:center;margin-bottom:4px;font-size:10.5px}
  .price{color:#1d2d8a;font-weight:700;margin-left:4px}
  .shirts{display:flex;justify-content:center;gap:30px;margin:14px 0}
  .color-row{display:flex;gap:20px;margin:6px 0 10px}
  hr{border:none;border-top:1px solid #ccc;margin:12px 0}
  .tickets{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px}
  .ticket-box{border:1px solid #999;border-radius:4px;height:80px;padding:6px;font-size:9px;color:#666;display:flex;flex-direction:column;justify-content:space-between}
  .ticket-box strong{font-size:10px;color:#111}
  .sig-box{border:1px solid #999;border-radius:4px;height:60px;margin-top:8px}
  .comment{background:#f9f9f9;border:1px solid #ddd;border-radius:4px;padding:6px 8px;font-size:10px;margin-top:8px;font-style:italic}
  @media print{body{padding:10px 12px}button{display:none!important}.no-print{display:none!important}}
</style>
</head>
<body>
<div class="brand">${magasinNom}</div>
<h1>Flocages</h1>
<br/>
<div class="grid2">
  <div class="left">
    <div><span class="field-label">Nom du CLIENT :</span><div class="field"><span class="field-value">${c.clientNom}</span></div></div>
    <div><span class="field-label">Numéro téléphone :</span><div class="field"><span class="field-value">${c.telephone || ''}</span></div></div>
    <div><span class="field-label">Date de commande :</span><div class="field"><span class="field-value">${c.dateCommande ? c.dateCommande.split('-').reverse().join('/') : ''}</span></div></div>
    <div><span class="field-label">Date de mise à disposition :</span><div class="field"><span class="field-value">${c.dateDispo ? c.dateDispo.split('-').reverse().join('/') : ''}</span></div></div>
    <div><span class="field-label">Suivi par (Vendeur) :</span><div class="field"><span class="field-value">${c.vendeur || ''}</span></div></div>
    <div><span class="field-label">Disposition maillot :</span><div class="field"><span class="field-value">${[haut?.texte, numero?.texte, bas?.texte, devant?.texte ? `♥ ${devant.texte}` : ''].filter(Boolean).join(' / ') || ''}</span></div></div>
    ${c.commentaire ? `<div class="comment">💬 ${c.commentaire}</div>` : ''}
  </div>
  <div class="right">
    <div class="shirts">
      <svg viewBox="0 0 160 175" width="90">
        <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1d4ed8"/><stop offset="100%" stop-color="#1e3a8a"/></linearGradient></defs>
        <path d="M57 17Q80 34 103 17L134 30L154 50L137 61L126 52L126 156L34 156L34 52L23 61L6 50L26 30Z" fill="url(#g1)"/>
        <path d="M57 17Q80 34 103 17Q91 45 69 45Z" fill="#1e3a8a" opacity="0.6"/>
        ${haut?.texte ? svgText(haut.texte.toUpperCase(), 80, 72, 10, 'font-size="10" fill="white" font-weight="800" letter-spacing="1"') : ''}
        ${numero?.texte ? `<text text-anchor="middle" x="80" y="120" font-size="${numero.taille === 'gros_numero' ? '44' : '30'}" fill="white" font-weight="900" font-family="Arial"><tspan x="80" y="120">${numero.texte}</tspan></text>` : ''}
        ${bas?.texte ? svgText(bas.texte.toUpperCase(), 80, 143, 8, 'font-size="8" fill="white" font-weight="700"') : ''}
      </svg>
      <svg viewBox="0 0 160 175" width="90">
        <defs><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1d4ed8"/><stop offset="100%" stop-color="#1e3a8a"/></linearGradient></defs>
        <path d="M57 17Q80 34 103 17L134 30L154 50L137 61L126 52L126 156L34 156L34 52L23 61L6 50L26 30Z" fill="url(#g2)"/>
        <path d="M57 17Q80 34 103 17Q91 45 69 45Z" fill="#1e3a8a" opacity="0.6"/>
        ${devantCentre?.texte ? svgText(devantCentre.texte.toUpperCase(), 80, 100, devantCentre.taille === 'grande_lettre' ? 10 : 8, `font-size="${devantCentre.taille === 'grande_lettre' ? '10' : '8'}" fill="white" font-weight="800" letter-spacing="1"`) : ''}
        ${devant?.texte ? svgText(devant.texte.toUpperCase(), 54, 75, devant.taille === 'grande_lettre' ? 9 : 7, `font-size="${devant.taille === 'grande_lettre' ? '9' : '7'}" fill="white" font-weight="800"`) : ''}
      </svg>
    </div>
  </div>
</div>

<hr/>

<div class="section-title">Choix et prix du Flocage :</div>
<div class="row">${chk(isOfficiel)} Flocage officiel <span class="price">20€</span></div>
<div class="row">${chk(hasNom && !hasNumero)} Nom ou Numéro <span class="price">7€</span></div>
<div class="row">${chk(hasNom && hasNumero)} Nom et numéro <span class="price">12€</span></div>
<div class="row">${chk(hasInitiales)} Initiales <span class="price">3€</span></div>
<div class="row">${chk(hasPhrase)} Phrase (=ou+ 4 mots avant et arrière compris) <span class="price">20€</span></div>
<div class="row">${chk(false)} Maillot déjà réglé</div>
<div class="row">${chk(false)} Maillot à régler</div>

<div class="color-row">
  <div class="row">${chk(c.couleur === 'blanc_contour_noir')} Blanc contour noir</div>
  <div class="row">${chk(c.couleur === 'noir_contour_blanc')} Noir contour Blanc</div>
</div>

<hr/>
<div style="font-size:9.5px;color:#666;margin-bottom:4px">Signature du client :</div>
<div class="sig-box"></div>

<div class="tickets">
  <div class="ticket-box"><strong>Ticket de caisse :</strong><div style="flex:1"></div></div>
  <div class="ticket-box"><div style="flex:1"></div></div>
</div>

<div class="no-print" style="margin-top:20px;text-align:center;display:flex;gap:12px;justify-content:center">
  <button onclick="window.print()" style="padding:10px 24px;background:#1d2d8a;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Imprimer</button>
  <button onclick="window.close()" style="padding:10px 24px;background:#eee;color:#333;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Fermer</button>
</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=720,height=900')
  win.document.write(html)
  win.document.close()
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getNextWeekday(dow) {
  const today = new Date()
  let diff = (dow - today.getDay() + 7) % 7
  if (diff === 0) diff = 7
  const d = new Date(today)
  d.setDate(today.getDate() + diff)
  return d
}

function fmtDate(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

function fmtDayFull(str) {
  if (!str) return ''
  const d = new Date(str + 'T12:00:00')
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function getWeekFlocageDays(ref) {
  const d = new Date(ref)
  const dow = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  monday.setHours(0, 0, 0, 0)
  return {
    mercredi: toDateStr(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 2)),
    vendredi: toDateStr(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4)),
  }
}

// Détermine la clé de stock selon la taille, le caractère et la couleur choisie.
// blanc_contour_noir → lettres/chiffres "blancs" → clé _blanc
// noir_contour_blanc → lettres/chiffres "noirs"  → clé _noir
// petite_lettre est toujours blanc (pas de variante noir)
function getCharTaille(taille, char, couleur) {
  const isDigit = /[0-9]/.test(char)
  const suffix = couleur === 'noir_contour_blanc' ? '_noir' : '_blanc'
  if (taille === 'grande_lettre') return isDigit ? `gros_numero${suffix}` : `grande_lettre${suffix}`
  if (taille === 'petite_lettre') return isDigit ? `petit_numero${suffix}` : 'petite_lettre'
  // si la taille contient déjà un suffix, on l'override avec la couleur courante
  const base = taille.replace(/_blanc$|_noir$/, '')
  return `${base}${suffix}`
}

function extractCharCounts(lignes, couleur = 'blanc_contour_noir') {
  const counts = {}
  for (const ligne of lignes) {
    if (!ligne.texte?.trim() || !ligne.taille) continue
    for (const c of ligne.texte.toUpperCase().replace(/[^A-Z0-9]/g, '').split('')) {
      const t = getCharTaille(ligne.taille, c, couleur)
      const key = `${t}.${c}`
      counts[key] = (counts[key] || 0) + 1
    }
  }
  return counts
}

function buildStockUpdates(lignes, sign = -1, couleur = 'blanc_contour_noir') {
  const counts = extractCharCounts(lignes, couleur)
  const updates = {}
  for (const [key, n] of Object.entries(counts)) {
    const [type, char] = key.split('.')
    if (!updates[type]) updates[type] = {}
    updates[type][char] = increment(sign * n)
  }
  return updates
}

const BASE_LABELS = {
  grande_lettre: 'Grande lettre',
  petite_lettre: 'Petite lettre',
  gros_numero: 'Gros numéro',
  petit_numero: 'Petit numéro',
}
function tailleLabel(key) {
  return TAILLE_TYPES.find(t => t.key === key)?.label || BASE_LABELS[key] || key
}

/* Helper : découpe un texte en lignes pour SVG */
function useWrapLines(text, fontSize, viewBoxWidth = 116) {
  if (!text) return []
  const maxChars = Math.floor(viewBoxWidth / (fontSize * 0.62))
  const words = text.split(' ')
  const lines = []
  let cur = ''
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w
    if (test.length > maxChars && cur) { lines.push(cur); cur = w }
    else cur = test
  }
  if (cur) lines.push(cur)
  return lines
}

function SvgTextWrap({ text, x, y, fontSize, ...props }) {
  const lines = useWrapLines(text, fontSize)
  const lineH = fontSize * 1.25
  return (
    <text x={x} textAnchor="middle" fontSize={fontSize} {...props}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} y={y + i * lineH}>{line}</tspan>
      ))}
    </text>
  )
}

/* ── ShirtPreview ───────────────────────────────────────────────────────── */
function ShirtPreview({ lignes = [], officiel = false, side = 'dos' }) {
  const haut = lignes.find(l => l.position === 'haut')
  const numero = lignes.find(l => l.position === 'numero')
  const bas = lignes.find(l => l.position === 'bas')
  const devantCoeur = lignes.find(l => l.position === 'devant_coeur')
  const devantCentre = lignes.find(l => l.position === 'devant_centre')

  const color1 = officiel ? '#b45309' : '#1d4ed8'
  const color2 = officiel ? '#92400e' : '#1e3a8a'
  const uid = side + (officiel ? 'o' : '')

  return (
    <div className="flex items-center justify-center bg-gray-100 dark:bg-neutral-800 rounded-xl p-4">
      <svg viewBox="0 0 200 220" className="w-36 h-auto drop-shadow-lg">
        <defs>
          <linearGradient id={`sg${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color1} />
            <stop offset="100%" stopColor={color2} />
          </linearGradient>
        </defs>
        <path d="M 72 22 Q 100 42 128 22 L 168 38 L 193 63 L 172 77 L 158 66 L 158 196 L 42 196 L 42 66 L 28 77 L 7 63 L 32 38 Z"
          fill={`url(#sg${uid})`} />
        <path d="M 72 22 Q 100 42 128 22 Q 114 57 86 57 Z" fill={color2} opacity="0.7" />
        <path d="M 42 66 L 28 77" stroke={color2} strokeWidth="1.5" fill="none" />
        <path d="M 158 66 L 172 77" stroke={color2} strokeWidth="1.5" fill="none" />

        {side === 'dos' ? (
          <>
            {haut?.texte ? (
              <SvgTextWrap text={haut.texte.toUpperCase()} x={100} y={92}
                fontSize={haut.taille === 'grande_lettre' ? 13 : 10}
                fill="white" fontWeight="800" fontFamily="Arial,sans-serif" letterSpacing="2" />
            ) : (
              <text x="100" y="92" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.2)" fontFamily="Arial">NOM</text>
            )}
            {numero?.texte ? (
              <text x="100" y="153" textAnchor="middle"
                fontSize={numero.taille === 'gros_numero' ? '56' : '38'}
                fill="white" fontWeight="900" fontFamily="Arial,sans-serif">
                {numero.texte}
              </text>
            ) : (
              <text x="100" y="153" textAnchor="middle" fontSize="30" fill="rgba(255,255,255,0.2)" fontFamily="Arial">00</text>
            )}
            {bas?.texte ? (
              <SvgTextWrap text={bas.texte.toUpperCase()} x={100} y={178}
                fontSize={bas.taille === 'grande_lettre' ? 12 : 9}
                fill="white" fontWeight="700" fontFamily="Arial,sans-serif" letterSpacing="1.5" />
            ) : (
              <text x="100" y="178" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.2)" fontFamily="Arial">TEXTE BAS</text>
            )}
          </>
        ) : (
          /* Devant */
          <>
            {devantCentre?.texte ? (
              <SvgTextWrap text={devantCentre.texte.toUpperCase()} x={100} y={140}
                fontSize={devantCentre.taille === 'grande_lettre' ? 12 : 9}
                fill="white" fontWeight="800" fontFamily="Arial,sans-serif" letterSpacing="1.5" />
            ) : (
              <text x="100" y="140" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.15)" fontFamily="Arial">TEXTE CENTRE</text>
            )}
            {devantCoeur?.texte ? (
              <SvgTextWrap text={devantCoeur.texte.toUpperCase()} x={68} y={100}
                fontSize={devantCoeur.taille === 'grande_lettre' ? 11 : 8}
                fill="white" fontWeight="800" fontFamily="Arial,sans-serif" letterSpacing="1" />
            ) : (
              <>
                <path d="M 68 91 C 68 87 62 83 58 88 C 55 92 58 97 68 103 C 78 97 81 92 78 88 C 74 83 68 87 68 91 Z"
                  fill="rgba(255,255,255,0.12)" />
              </>
            )}
          </>
        )}

        {officiel && (
          <>
            <circle cx="163" cy="86" r="15" fill="#f59e0b" />
            <text x="163" y="89" textAnchor="middle" fontSize="6" fill="white" fontWeight="bold" fontFamily="Arial">OFFICIEL</text>
          </>
        )}
      </svg>
    </div>
  )
}

/* ── CommandeModal ──────────────────────────────────────────────────────── */
const DEFAULT_LIGNES = [
  { position: 'haut', texte: '', taille: 'grande_lettre' },
  { position: 'numero', texte: '', taille: 'gros_numero' },
  { position: 'bas', texte: '', taille: 'petite_lettre' },
  { position: 'devant_coeur', texte: '', taille: 'petite_lettre' },
  { position: 'devant_centre', texte: '', taille: 'petite_lettre' },
]

function mergeLignes(existing) {
  return DEFAULT_LIGNES.map(def => {
    const found = existing?.find(l => l.position === def.position)
    return found || def
  })
}

function CommandeModal({ commande, onClose, onSave, stock, profile, magasinId }) {
  const nextMer = getNextWeekday(3)
  const nextVen = getNextWeekday(5)

  const [form, setForm] = useState({
    clientNom: commande?.clientNom || '',
    telephone: commande?.telephone || '',
    vendeur: commande?.vendeur || profile?.displayName?.split(' ')[0] || '',
    dateCommande: commande?.dateCommande || toDateStr(new Date()),
    dateDispo: commande?.dateDispo || toDateStr(nextMer),
    jourFlocage: commande?.jourFlocage || 'mercredi',
    officiel: commande?.officiel ?? false,
    couleur: commande?.couleur || 'blanc_contour_noir',
    lignes: mergeLignes(commande?.lignes),
    commentaire: commande?.commentaire || '',
  })
  const [vendeurs, setVendeurs] = useState([])
  const [flocageSide, setFlocageSide] = useState('dos')
  const [previewSide, setPreviewSide] = useState('dos')
  const [saving, setSaving] = useState(false)

  // Charger les vendeurs du rayon chaussure
  useEffect(() => {
    if (!magasinId) return
    // Cherche les rayons chaussure du magasin, puis charge leur staff
    getDocs(query(
      collection(db, 'magasins', magasinId, 'rayons'),
      where('type', '==', 'chaussure'),
    )).then(snap => {
      if (snap.empty) return
      const rayonIds = snap.docs.map(d => d.id)
      // Charge le staff de ces rayons
      Promise.all(rayonIds.map(rid =>
        getDocs(collection(db, 'magasins', magasinId, 'rayons', rid, 'staff'))
      )).then(snaps => {
        const all = snaps.flatMap(s => s.docs.map(d => d.data().nom)).filter(Boolean).sort()
        setVendeurs(all)
      })
    })
  }, [magasinId])

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function setLigne(pos, k, v) {
    setForm(f => ({ ...f, lignes: f.lignes.map(l => l.position === pos ? { ...l, [k]: v } : l) }))
  }
  function pickJour(jour) {
    setF('jourFlocage', jour)
    setF('dateDispo', toDateStr(jour === 'mercredi' ? nextMer : nextVen))
  }

  const charCounts = useMemo(() => extractCharCounts(form.lignes, form.couleur), [form.lignes, form.couleur])
  const stockWarnings = useMemo(() => {
    if (!stock) return []
    return Object.entries(charCounts).flatMap(([key, needed]) => {
      const [type, char] = key.split('.')
      const have = stock[type]?.[char] ?? 0
      return have < needed
        ? [`${tailleLabel(type)} « ${char} » : ${have} dispo, ${needed} requis`]
        : []
    })
  }, [charCounts, stock])

  async function handleSave(e) {
    e.preventDefault()
    if (!form.clientNom.trim()) return
    setSaving(true)
    try { await onSave(form); onClose() }
    finally { setSaving(false) }
  }

  const DOSlignes = [
    { pos: 'haut', label: '↑ Nom / Ligne haut', opts: ['grande_lettre', 'petite_lettre'], placeholder: 'Ex : MATÉO' },
    { pos: 'numero', label: '# Numéro', opts: ['gros_numero', 'petit_numero'], placeholder: 'Ex : 10' },
    { pos: 'bas', label: '↓ Sponsor / Ligne bas', opts: ['grande_lettre', 'petite_lettre'], placeholder: 'Ex : LE BOSS' },
  ]

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800 shrink-0">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {commande?.id ? 'Modifier le flocage' : 'Nouveau flocage'}
          </span>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 min-h-0 overflow-y-auto">
          <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-neutral-800">

            {/* ── Colonne gauche : formulaire ── */}
            <div className="p-5 space-y-4">

              {/* Client / Téléphone */}
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Client *</span>
                  <input className="Input h-11 text-sm font-medium" value={form.clientNom}
                    onChange={e => setF('clientNom', e.target.value)} placeholder="Nom du client" autoFocus />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Téléphone</span>
                  <input type="tel" className="Input h-11 text-sm" value={form.telephone}
                    onChange={e => setF('telephone', e.target.value)} placeholder="06 …" />
                </label>
              </div>

              {/* Vendeur */}
              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Vendeur</span>
                {vendeurs.length > 0 ? (
                  <select className="Input h-11 text-sm" value={form.vendeur} onChange={e => setF('vendeur', e.target.value)}>
                    <option value="">— Sélectionner</option>
                    {vendeurs.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : (
                  <input className="Input h-11 text-sm" value={form.vendeur}
                    onChange={e => setF('vendeur', e.target.value)} placeholder="Prénom du vendeur" />
                )}
              </label>

              {/* Date + Officiel */}
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Date commande</span>
                  <input type="date" className="Input h-11" value={form.dateCommande} onChange={e => setF('dateCommande', e.target.value)} />
                </label>
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide block">Type</span>
                  <button type="button" onClick={() => setF('officiel', !form.officiel)}
                    className={['h-11 w-full rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors',
                      form.officiel
                        ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/40'
                        : 'border-gray-200 dark:border-neutral-700 text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800',
                    ].join(' ')}>
                    <svg className="h-3.5 w-3.5" fill={form.officiel ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                    </svg>
                    {form.officiel ? 'Officiel ★' : 'Non officiel'}
                  </button>
                </div>
              </div>

              {/* Couleur du flocage */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Couleur du flocage</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'blanc_contour_noir', label: 'Blanc contour noir', preview: ['white', '#111'] },
                    { key: 'noir_contour_blanc', label: 'Noir contour blanc', preview: ['#111', 'white'] },
                  ].map(c => (
                    <button key={c.key} type="button" onClick={() => setF('couleur', c.key)}
                      className={['h-10 rounded-xl border flex items-center gap-2 px-3 text-xs font-medium transition-colors',
                        form.couleur === c.key
                          ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-neutral-800'
                          : 'border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-500 dark:text-neutral-400',
                      ].join(' ')}>
                      <span className="h-5 w-5 rounded-full border-2 shrink-0" style={{ background: c.preview[0], borderColor: c.preview[1] }} />
                      <span className="text-gray-700 dark:text-neutral-300">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Jour de flocage */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Jour de flocage</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'mercredi', label: 'Mercredi', date: nextMer },
                    { key: 'vendredi', label: 'Vendredi ⚡', date: nextVen },
                  ].map(j => (
                    <button key={j.key} type="button" onClick={() => pickJour(j.key)}
                      className={['rounded-xl border p-3 text-left transition-colors',
                        form.jourFlocage === j.key
                          ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-neutral-800'
                          : 'border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800',
                      ].join(' ')}>
                      <p className="text-sm font-semibold text-gray-800 dark:text-neutral-200">{j.label}</p>
                      <p className="text-[11px] text-gray-400 dark:text-neutral-500">{fmtDate(toDateStr(j.date))}</p>
                    </button>
                  ))}
                </div>
                {/* Card date personnalisée */}
                <button type="button" onClick={() => setF('jourFlocage', 'custom')}
                  className={['w-full rounded-xl border p-3 text-left transition-colors',
                    form.jourFlocage === 'custom'
                      ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-neutral-800'
                      : 'border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-800',
                  ].join(' ')}>
                  <p className="text-sm font-semibold text-gray-800 dark:text-neutral-200">Date personnalisée</p>
                  <p className="text-[11px] text-gray-400 dark:text-neutral-500">Choisir une date manuellement</p>
                </button>
                {form.jourFlocage === 'custom' && (
                  <input type="date" className="Input h-10 text-sm w-full" value={form.dateDispo}
                    onChange={e => setF('dateDispo', e.target.value)} autoFocus />
                )}
              </div>

              {/* Commentaire */}
              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Commentaire</span>
                <textarea className="Input resize-none h-20 text-sm leading-relaxed" placeholder="Instructions particulières, couleur, placement…"
                  value={form.commentaire} onChange={e => setF('commentaire', e.target.value)} />
              </label>
            </div>

            {/* ── Colonne droite : flocage + aperçu ── */}
            <div className="p-5 space-y-4 flex flex-col">

              {/* Onglets Dos / Devant */}
              <div className="flex items-center gap-1 border-b border-gray-100 dark:border-neutral-800">
                {[{ key: 'dos', label: 'Dos' }, { key: 'devant', label: 'Devant' }].map(t => (
                  <button key={t.key} type="button" onClick={() => { setFlocageSide(t.key); setPreviewSide(t.key) }}
                    className={['h-8 px-3 text-xs font-semibold border-b-2 transition-colors',
                      flocageSide === t.key
                        ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white'
                        : 'border-transparent text-gray-400 dark:text-neutral-500 hover:text-gray-700 dark:hover:text-neutral-300',
                    ].join(' ')}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Lignes DOS */}
              {flocageSide === 'dos' && (
                <div className="space-y-3">
                  {DOSlignes.map(({ pos, label, opts, placeholder }) => {
                    const ligne = form.lignes.find(l => l.position === pos)
                    return (
                      <div key={pos} className="space-y-1.5">
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-neutral-400">{label}</span>
                        <div className="flex gap-2">
                          <input
                            className="Input flex-1 h-14 text-lg font-bold tracking-wide"
                            value={ligne.texte}
                            onChange={e => setLigne(pos, 'texte', e.target.value)}
                            placeholder={placeholder}
                          />
                          <select className="Input w-36 text-xs h-14" value={ligne.taille}
                            onChange={e => setLigne(pos, 'taille', e.target.value)}>
                            {opts.map(o => <option key={o} value={o}>{tailleLabel(o)}</option>)}
                          </select>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Ligne DEVANT */}
              {flocageSide === 'devant' && (
                <div className="space-y-4">
                  {[
                    { pos: 'devant_centre', label: '▣ Texte centre (milieu du maillot)', placeholder: 'Ex : FC Lyon, FRANCE…' },
                    { pos: 'devant_coeur', label: '♥ Texte cœur (côté gauche, poitrine)', placeholder: 'Ex : MG, initiales…' },
                  ].map(({ pos, label, placeholder }) => {
                    const ligne = form.lignes.find(l => l.position === pos)
                    return (
                      <div key={pos} className="space-y-1.5">
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-neutral-400">{label}</span>
                        <div className="flex gap-2">
                          <input
                            className="Input flex-1 h-14 text-lg font-bold tracking-wide"
                            value={ligne.texte}
                            onChange={e => setLigne(pos, 'texte', e.target.value)}
                            placeholder={placeholder}
                          />
                          <select className="Input w-36 text-xs h-14" value={ligne.taille}
                            onChange={e => setLigne(pos, 'taille', e.target.value)}>
                            {['grande_lettre', 'petite_lettre'].map(o => (
                              <option key={o} value={o}>{tailleLabel(o)}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Aperçu */}
              <div className="space-y-2 mt-auto">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Aperçu</span>
                  <div className="flex items-center h-6 rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
                    {['dos', 'devant'].map(s => (
                      <button key={s} type="button" onClick={() => setPreviewSide(s)}
                        className={['h-full px-2.5 text-[10px] font-semibold transition-colors',
                          previewSide === s
                            ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                            : 'text-gray-400 dark:text-neutral-500 hover:bg-gray-50 dark:hover:bg-neutral-800',
                          s === 'devant' ? 'border-l border-gray-200 dark:border-neutral-700' : '',
                        ].join(' ')}>
                        {s === 'dos' ? 'Dos' : 'Devant'}
                      </button>
                    ))}
                  </div>
                </div>
                <ShirtPreview lignes={form.lignes} officiel={form.officiel} side={previewSide} />
              </div>

              {/* Caractères + warnings */}
              {Object.keys(charCounts).length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">Caractères à décompter</span>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(charCounts).map(([key, n]) => {
                      const [type, char] = key.split('.')
                      return (
                        <span key={key} className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${TAILLE_COLORS[type]}`}>
                          {char}{n > 1 ? `×${n}` : ''}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              {stockWarnings.length > 0 && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 space-y-1">
                  <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">⚠ Stock insuffisant</p>
                  {stockWarnings.map((w, i) => <p key={i} className="text-[11px] text-amber-600 dark:text-amber-300/80">{w}</p>)}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800">
            <button type="button" onClick={onClose}
              className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">
              Annuler
            </button>
            <button type="submit" disabled={saving || !form.clientNom.trim()}
              className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── StockAjoutModal ────────────────────────────────────────────────────── */
function StockAjoutModal({ magasinId, onClose }) {
  const [typeKey, setTypeKey] = useState(TAILLE_TYPES[0].key)
  const [qtys, setQtys] = useState({})
  const [saving, setSaving] = useState(false)
  const chars = TAILLE_TYPES.find(t => t.key === typeKey)?.chars || LETTRES

  function changeType(k) { setTypeKey(k); setQtys({}) }

  async function handleSave() {
    setSaving(true)
    try {
      const updates = {}
      for (const [char, qty] of Object.entries(qtys)) {
        const n = parseInt(qty)
        if (!isNaN(n) && n !== 0) {
          if (!updates[typeKey]) updates[typeKey] = {}
          updates[typeKey][char] = increment(n)
        }
      }
      if (Object.keys(updates).length > 0) {
        await setDoc(doc(db, 'flocage_stock', magasinId), updates, { merge: true })
      }
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-neutral-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Réapprovisionner le stock</span>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {TAILLE_TYPES.map(t => (
              <button key={t.key} type="button" onClick={() => changeType(t.key)}
                className={['h-8 px-3 rounded-lg text-xs font-semibold border transition-colors',
                  typeKey === t.key
                    ? `${TAILLE_COLORS[t.key]} border-transparent`
                    : 'text-gray-500 border-gray-200 dark:border-neutral-700 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800',
                ].join(' ')}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-neutral-500">Entrez la quantité à ajouter au stock actuel</p>
          <div className="grid grid-cols-9 gap-2">
            {chars.map(c => (
              <div key={c} className="flex flex-col items-center gap-1.5">
                <span className={`h-9 w-9 flex items-center justify-center rounded-lg text-base font-bold ${TAILLE_COLORS[typeKey]}`}>{c}</span>
                <input type="number" min="0" max="999"
                  className="Input h-10 text-center text-base font-semibold px-0 w-full"
                  value={qtys[c] || ''}
                  onChange={e => setQtys(q => ({ ...q, [c]: e.target.value }))}
                  placeholder="0" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-neutral-800">
          <button onClick={onClose}
            className="h-8 px-3 rounded-lg text-xs border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800">
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving}
            className="h-8 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
            {saving ? 'Enregistrement…' : 'Ajouter au stock'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── CommandeCard ───────────────────────────────────────────────────────── */
function CommandeCard({ commande: c, canEdit, onEdit, onDelete, onToggle, magasinNom }) {
  const haut = c.lignes?.find(l => l.position === 'haut')
  const numero = c.lignes?.find(l => l.position === 'numero')
  const bas = c.lignes?.find(l => l.position === 'bas')

  return (
    <div className={['bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-4 flex gap-4 group transition-opacity',
      c.status === 'fait' ? 'opacity-50' : '',
    ].join(' ')}>
      {/* Mini aperçu maillot */}
      <div className="shrink-0 w-16">
        <svg viewBox="0 0 200 220" className="w-full drop-shadow">
          <defs>
            <linearGradient id={`g${c.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.officiel ? '#b45309' : '#1d4ed8'} />
              <stop offset="100%" stopColor={c.officiel ? '#92400e' : '#1e3a8a'} />
            </linearGradient>
          </defs>
          <path d="M 72 22 Q 100 42 128 22 L 168 38 L 193 63 L 172 77 L 158 66 L 158 196 L 42 196 L 42 66 L 28 77 L 7 63 L 32 38 Z" fill={`url(#g${c.id})`} />
          <path d="M 72 22 Q 100 42 128 22 Q 114 57 86 57 Z" fill="rgba(0,0,0,0.25)" />
          {haut?.texte && <text x="100" y="92" textAnchor="middle" fontSize="10" fill="white" fontWeight="800" fontFamily="Arial">{haut.texte.toUpperCase().slice(0, 8)}</text>}
          {numero?.texte && <text x="100" y="155" textAnchor="middle" fontSize={numero.taille === 'gros_numero' ? '60' : '42'} fill="white" fontWeight="900" fontFamily="Arial">{numero.texte}</text>}
          {bas?.texte && <text x="100" y="178" textAnchor="middle" fontSize="9" fill="white" fontWeight="700" fontFamily="Arial">{bas.texte.toUpperCase().slice(0, 10)}</text>}
        </svg>
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{c.clientNom}</p>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              {c.officiel && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">★ Officiel</span>
              )}
              <span className={['text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                c.jourFlocage === 'vendredi'
                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
              ].join(' ')}>
                {c.jourFlocage === 'vendredi' ? '⚡ Ven.' : 'Mer.'} {fmtDate(c.dateDispo)}
              </span>
              {c.vendeur && <span className="text-[10px] text-gray-400 dark:text-neutral-500">{c.vendeur}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
            <button onClick={() => printCommande(c, magasinNom)}
              className="h-6 w-6 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-neutral-600 dark:hover:text-neutral-200 dark:hover:bg-neutral-800"
              title="Imprimer">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>
            </button>
            {canEdit && (<>
              <button onClick={onEdit}
                className="h-6 w-6 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-neutral-600 dark:hover:text-neutral-200 dark:hover:bg-neutral-800">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </button>
              <button onClick={onDelete}
                className="h-6 w-6 grid place-items-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:text-neutral-600 dark:hover:text-red-400 dark:hover:bg-red-500/10">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4.8A1.8 1.8 0 019.8 3h4.4A1.8 1.8 0 0116 4.8V6m3 0l-1 13a2 2 0 01-2 1.8H8A2 2 0 016 19L5 6" /></svg>
              </button>
            </>)}
          </div>
        </div>

        <div className="text-[11px] space-y-0.5">
          {haut?.texte && <p className="text-gray-500 dark:text-neutral-400">↑ <span className="font-medium text-gray-700 dark:text-neutral-300">{haut.texte}</span> <span className="text-gray-400">({tailleLabel(haut.taille)})</span></p>}
          {numero?.texte && <p className="text-gray-500 dark:text-neutral-400"># <span className="font-bold text-gray-900 dark:text-white text-sm">{numero.texte}</span> <span className="text-gray-400">({tailleLabel(numero.taille)})</span></p>}
          {bas?.texte && <p className="text-gray-500 dark:text-neutral-400">↓ <span className="font-medium text-gray-700 dark:text-neutral-300">{bas.texte}</span> <span className="text-gray-400">({tailleLabel(bas.taille)})</span></p>}
          {(() => { const dc = c.lignes?.find(l => l.position === 'devant_coeur'); return dc?.texte ? <p className="text-gray-500 dark:text-neutral-400">♥ <span className="font-medium text-gray-700 dark:text-neutral-300">{dc.texte}</span> <span className="text-gray-400">({tailleLabel(dc.taille)})</span></p> : null })()}
          {c.commentaire && <p className="text-[11px] text-gray-400 dark:text-neutral-500 italic mt-1 border-l-2 border-gray-200 dark:border-neutral-700 pl-2">{c.commentaire}</p>}
        </div>

        {canEdit && (
          <button onClick={onToggle}
            className={['h-6 px-2.5 rounded-lg text-[10px] font-semibold border transition-colors',
              c.status === 'fait'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400'
                : 'border-gray-200 dark:border-neutral-700 text-gray-500 dark:text-neutral-400 hover:border-emerald-300 hover:bg-emerald-50 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10',
            ].join(' ')}>
            {c.status === 'fait' ? '✓ Fait' : 'Marquer fait'}
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Main ───────────────────────────────────────────────────────────────── */
export default function Flocage() {
  const { user, profile } = useAuth(s => ({ user: s.user, profile: s.profile }))
  const { selectedId } = useMagasin()
  const isGlobal = GLOBAL_ROLES.includes(profile?.role)
  const effectiveMagasinId = isGlobal ? selectedId : profile?.magasinId
  const canEdit = ['chaussure', 'directeurmag', 'acheteur', 'directeurgen'].includes(profile?.role)

  const [tab, setTab] = useState('commandes')
  const [commandes, setCommandes] = useState([])
  const [stock, setStock] = useState({})
  const [modal, setModal] = useState(null)
  const [stockModal, setStockModal] = useState(false)
  const [refDate, setRefDate] = useState(new Date())
  const [magasinNom, setMagasinNom] = useState('Intersport')

  useEffect(() => {
    if (!effectiveMagasinId) return
    return onSnapshot(doc(db, 'magasins', effectiveMagasinId), snap => {
      if (snap.exists()) setMagasinNom(snap.data().nom || 'Intersport')
    })
  }, [effectiveMagasinId])

  useEffect(() => {
    if (!effectiveMagasinId) return
    const q = query(
      collection(db, 'flocage_commandes'),
      where('magasinId', '==', effectiveMagasinId),
      orderBy('dateDispo', 'asc'),
    )
    return onSnapshot(q, snap => setCommandes(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [effectiveMagasinId])

  useEffect(() => {
    if (!effectiveMagasinId) return
    return onSnapshot(doc(db, 'flocage_stock', effectiveMagasinId), snap => {
      setStock(snap.exists() ? snap.data() : {})
    })
  }, [effectiveMagasinId])

  async function handleSave(form) {
    const baseData = {
      clientNom: form.clientNom.trim(),
      telephone: form.telephone.trim() || null,
      vendeur: form.vendeur.trim() || null,
      dateCommande: form.dateCommande,
      dateDispo: form.dateDispo,
      jourFlocage: form.jourFlocage,
      officiel: form.officiel,
      couleur: form.couleur || null,
      lignes: form.lignes,
      commentaire: form.commentaire.trim() || null,
      magasinId: effectiveMagasinId,
    }
    if (modal?.id) {
      // Restaurer l'ancien stock puis déduire le nouveau
      const restore = buildStockUpdates(modal.lignes, +1, modal.couleur)
      const deduct = buildStockUpdates(form.lignes, -1, form.couleur)
      if (effectiveMagasinId && Object.keys(restore).length > 0)
        await setDoc(doc(db, 'flocage_stock', effectiveMagasinId), restore, { merge: true })
      if (effectiveMagasinId && Object.keys(deduct).length > 0)
        await setDoc(doc(db, 'flocage_stock', effectiveMagasinId), deduct, { merge: true })
      await updateDoc(doc(db, 'flocage_commandes', modal.id), { ...baseData, updatedAt: serverTimestamp() })
    } else {
      await addDoc(collection(db, 'flocage_commandes'), {
        ...baseData,
        status: 'en_attente',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      })
      const deduct = buildStockUpdates(form.lignes, -1, form.couleur)
      if (effectiveMagasinId && Object.keys(deduct).length > 0)
        await setDoc(doc(db, 'flocage_stock', effectiveMagasinId), deduct, { merge: true })
    }
  }

  async function handleDelete(c) {
    if (!confirm(`Supprimer le flocage de "${c.clientNom}" ?`)) return
    await deleteDoc(doc(db, 'flocage_commandes', c.id))
    const restore = buildStockUpdates(c.lignes, +1, c.couleur)
    if (effectiveMagasinId && Object.keys(restore).length > 0)
      await setDoc(doc(db, 'flocage_stock', effectiveMagasinId), restore, { merge: true })
  }

  async function handleToggle(c) {
    await updateDoc(doc(db, 'flocage_commandes', c.id), {
      status: c.status === 'fait' ? 'en_attente' : 'fait',
      updatedAt: serverTimestamp(),
    })
  }

  const { mercredi: merStr, vendredi: venStr } = useMemo(() => getWeekFlocageDays(refDate), [refDate])
  const parJour = useMemo(() => ({
    mercredi: commandes.filter(c => c.dateDispo === merStr),
    vendredi: commandes.filter(c => c.dateDispo === venStr),
  }), [commandes, merStr, venStr])

  function prevWeek() { const d = new Date(refDate); d.setDate(d.getDate() - 7); setRefDate(d) }
  function nextWeek() { const d = new Date(refDate); d.setDate(d.getDate() + 7); setRefDate(d) }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-neutral-950">
      <Navbar />
      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Flocage</h1>
              <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">Gestion des commandes et du stock de flocage</p>
            </div>
            {canEdit && tab !== 'stock' && (
              <button onClick={() => setModal({})}
                className="h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
                + Nouveau flocage
              </button>
            )}
            {tab === 'stock' && canEdit && (
              <button onClick={() => setStockModal(true)}
                className="h-8 px-4 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-100">
                Réapprovisionner
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-gray-200 dark:border-neutral-800">
            {[
              { key: 'commandes', label: 'Commandes', count: commandes.filter(c => c.status === 'en_attente').length },
              { key: 'planning', label: 'Planning' },
              { key: 'stock', label: 'Stock' },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={['h-9 px-4 text-xs font-semibold border-b-2 transition-colors',
                  tab === t.key
                    ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white'
                    : 'border-transparent text-gray-400 dark:text-neutral-500 hover:text-gray-700 dark:hover:text-neutral-300',
                ].join(' ')}>
                {t.label}
                {t.count > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Commandes ── */}
          {tab === 'commandes' && (
            commandes.length === 0 ? (
              <div className="text-center py-16 text-sm text-gray-400 dark:text-neutral-500">
                Aucune commande.{canEdit && ' Cliquez sur "+ Nouveau flocage" pour commencer.'}
              </div>
            ) : (
              <div className="space-y-5">
                {['en_attente', 'fait'].map(status => {
                  const list = commandes.filter(c => c.status === status)
                  if (!list.length) return null
                  return (
                    <div key={status}>
                      <h3 className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-2">
                        {status === 'en_attente' ? 'En attente' : 'Fait'} ({list.length})
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {list.map(c => (
                          <CommandeCard key={c.id} commande={c} canEdit={canEdit}
                            magasinNom={magasinNom}
                            onEdit={() => setModal(c)}
                            onDelete={() => handleDelete(c)}
                            onToggle={() => handleToggle(c)} />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {/* ── Planning ── */}
          {tab === 'planning' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={prevWeek} className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-neutral-800">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-xs font-semibold text-gray-700 dark:text-neutral-300">
                  Semaine du {fmtDate(merStr)} au {fmtDate(venStr)}
                </span>
                <button onClick={nextWeek} className="h-7 w-7 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-neutral-800">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
                <button onClick={() => setRefDate(new Date())}
                  className="h-7 px-2.5 rounded-lg text-[11px] font-medium border border-gray-200 dark:border-neutral-700 text-gray-500 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800 ml-1">
                  Aujourd'hui
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'mercredi', label: 'Mercredi', date: merStr },
                  { key: 'vendredi', label: 'Vendredi ⚡', date: venStr },
                ].map(col => (
                  <div key={col.key} className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-neutral-800 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-gray-900 dark:text-white">{col.label}</p>
                        <p className="text-[11px] text-gray-400 dark:text-neutral-500 capitalize">{fmtDayFull(col.date)}</p>
                      </div>
                      <span className={['text-[11px] font-semibold px-2 py-0.5 rounded-full',
                        parJour[col.key].length > 0
                          ? 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300'
                          : 'bg-gray-100 text-gray-400 dark:bg-neutral-800 dark:text-neutral-500',
                      ].join(' ')}>
                        {parJour[col.key].length} flocage{parJour[col.key].length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="p-3 space-y-2">
                      {parJour[col.key].length === 0 ? (
                        <p className="text-[11px] text-gray-400 dark:text-neutral-500 text-center py-6">Aucun flocage prévu</p>
                      ) : parJour[col.key].map(c => (
                        <CommandeCard key={c.id} commande={c} canEdit={canEdit}
                          magasinNom={magasinNom}
                          onEdit={() => setModal(c)}
                          onDelete={() => handleDelete(c)}
                          onToggle={() => handleToggle(c)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Stock ── */}
          {tab === 'stock' && (
            <div className="grid grid-cols-2 gap-4">
              {TAILLE_TYPES.map(t => {
                const typeStock = stock[t.key] || {}
                const total = t.chars.reduce((sum, c) => sum + Math.max(0, typeStock[c] ?? 0), 0)
                return (
                  <div key={t.key} className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-neutral-800 flex items-center justify-between">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TAILLE_COLORS[t.key]}`}>{t.label}</span>
                      <span className="text-[11px] text-gray-400 dark:text-neutral-500">{total} pièces</span>
                    </div>
                    <div className="p-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${t.chars.length <= 10 ? t.chars.length : 9}, minmax(0, 1fr))` }}>
                      {t.chars.map(c => {
                        const qty = typeStock[c] ?? 0
                        return (
                          <div key={c} className={['flex flex-col items-center gap-0.5 p-1.5 rounded-lg border',
                            qty <= 0 ? 'border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10'
                              : qty <= 3 ? 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10'
                                : 'border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30',
                          ].join(' ')}>
                            <span className={['text-xs font-bold',
                              qty <= 0 ? 'text-red-600 dark:text-red-400'
                                : qty <= 3 ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-gray-700 dark:text-neutral-300',
                            ].join(' ')}>{c}</span>
                            <span className={['text-[10px] font-semibold tabular-nums',
                              qty <= 0 ? 'text-red-500 dark:text-red-400'
                                : qty <= 3 ? 'text-amber-500 dark:text-amber-400'
                                  : 'text-gray-400 dark:text-neutral-500',
                            ].join(' ')}>{Math.max(0, qty)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {modal !== null && (
        <CommandeModal
          commande={modal?.id ? modal : null}
          onClose={() => setModal(null)}
          onSave={handleSave}
          stock={stock}
          profile={profile}
          magasinId={effectiveMagasinId}
        />
      )}
      {stockModal && effectiveMagasinId && (
        <StockAjoutModal magasinId={effectiveMagasinId} onClose={() => setStockModal(false)} />
      )}
    </div>
  )
}
