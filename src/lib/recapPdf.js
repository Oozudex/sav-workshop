// Récapitulatif de commande en PDF (A4 portrait) remis au client : aux couleurs Intersport pour les
// commandes clients, OBUT (jaune et noir) pour les boules sur mesure. Données : recapCommande.js.
// Polices dans public/ilv/fonts/, logos dans public/recap/. Coordonnées en mm depuis le haut à gauche.
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const PT = 72 / 25.4, W = 210, H = 297
const X0 = 14, X1 = 196                       // marges
const hex = h => rgb(...[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255))
const C = {
  bleu: hex('#003D8F'), rouge: hex('#E30613'), jaune: hex('#FFE600'), noir: hex('#1D1D1B'),
  texte: hex('#2B2F38'), gris: hex('#6B7280'), trait: hex('#D9DEE7'), fond: hex('#F4F6FA'), blanc: rgb(1, 1, 1),
}
// Couleurs de chaque document : accent (bandeaux, titres), encre sur l'accent
const THEMES = {
  client: { accent: C.bleu, surAccent: C.blanc, titre: C.bleu, pied: C.bleu, surPied: C.blanc },
  obut: { accent: C.jaune, surAccent: C.noir, titre: C.noir, pied: C.noir, surPied: C.jaune },
}

const FONTS = {
  titre: 'ilv/fonts/Montserrat-Bold.ttf', titreM: 'ilv/fonts/Montserrat-Medium.ttf',
  txt: 'ilv/fonts/SourceSans3-Regular.ttf', gras: 'ilv/fonts/SourceSans3-Bold.ttf',
}
const LOGOS = { client: ['recap/intersport-blanc.png'], obut: ['recap/obut.png', 'recap/intersport-bleu.png'] }

// Espaces fines et insécables d'Intl remplacées : toutes les polices ne les ont pas
const euro = n => (n == null ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n).replace(/\s/g, ' '))

function outils(page, f) {
  const g = {
    f,
    width: (s, font, size) => font.widthOfTextAtSize(s, size) / PT,
    // Texte sur sa ligne de base ; réduit pour tenir dans maxWidth
    t(s, x, y, { font = f.txt, size = 10, color = C.texte, align = 'left', maxWidth } = {}) {
      s = String(s ?? '')
      if (!s) return 0
      let sz = size
      if (maxWidth && g.width(s, font, sz) > maxWidth) sz *= maxWidth / g.width(s, font, sz)
      const w = g.width(s, font, sz)
      page.drawText(s, { x: (align === 'right' ? x - w : align === 'center' ? x - w / 2 : x) * PT, y: (H - y) * PT, size: sz, font, color })
      return w
    },
    // Coupe un texte en lignes de maxWidth au plus (mots entiers)
    lignes(s, font, size, maxWidth) {
      const out = []
      let cur = ''
      for (const mot of String(s).split(/\s+/)) {
        const essai = cur ? `${cur} ${mot}` : mot
        if (cur && g.width(essai, font, size) > maxWidth) { out.push(cur); cur = mot } else cur = essai
      }
      if (cur) out.push(cur)
      return out
    },
    rect: (x, y, w, h, color) => page.drawRectangle({ x: x * PT, y: (H - y - h) * PT, width: w * PT, height: h * PT, color }),
    round(x, y, w, h, r, opts) {
      page.drawSvgPath(`M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`,
        { x: 0, y: H * PT, scale: PT, ...opts })
    },
    image(im, x, y, w) {
      const h = w * im.height / im.width
      page.drawImage(im, { x: x * PT, y: (H - y - h) * PT, width: w * PT, height: h * PT })
      return h
    },
    circle: (cx, cy, r, opts) => page.drawCircle({ x: cx * PT, y: (H - cy) * PT, size: r * PT, ...opts }),
    line: (x1, y1, x2, y2, color = C.trait, th = 0.3) => page.drawLine({ start: { x: x1 * PT, y: (H - y1) * PT }, end: { x: x2 * PT, y: (H - y2) * PT }, thickness: th * PT, color }),
  }
  return g
}

// ── Blocs communs ────────────────────────────────────────────────────────────

function intro(g, y, sousTitre) {
  g.t('Merci pour votre commande !', X0, y, { font: g.f.titre, size: 15, color: C.noir })
  g.t(sousTitre, X0, y + 6.5, { size: 10, color: C.gris, maxWidth: X1 - X0 })
}

function carte(g, x, y, titre, lignes, th) {
  const w = 88, h = 30
  g.round(x, y, w, h, 3, { color: C.fond })
  g.rect(x, y + 3, 1.2, h - 6, th.accent)
  g.t(titre.toUpperCase(), x + 6, y + 8, { font: g.f.titre, size: 7.5, color: th.titre })
  lignes.forEach(([l, v], i) => {
    g.t(l, x + 6, y + 15.5 + i * 6.6, { size: 8.5, color: C.gris })
    g.t(v || '—', x + 32, y + 15.5 + i * 6.6, { font: g.f.gras, size: 10, color: C.noir, maxWidth: w - 38 })
  })
}

function infos(g, y, r, th) {
  carte(g, X0, y, 'Client', [['Nom', r.client], ['Téléphone', r.tel]], th)
  carte(g, 108, y, 'Commande', [['Date', r.date], ['Vendeur', r.vendeur]], th)
}

// Tableau des lignes ; colonnes Référence et Qté seulement pour les commandes clients, pas de prix en SAV
function tableau(g, y, lignes, th, { colonnes, prix = true }) {
  g.round(X0, y, X1 - X0, 8, 2, { color: th.pied })
  const head = { font: g.f.titre, size: 7, color: th.surPied }
  const largeur = colonnes ? (prix ? 98 : 110) : 140
  const xRef = prix ? 118 : 130, xQte = prix ? 156 : 186
  g.t('DÉSIGNATION', X0 + 4, y + 5.4, head)
  if (colonnes) { g.t('RÉFÉRENCE', xRef, y + 5.4, head); g.t('QTÉ', xQte, y + 5.4, { ...head, align: 'center' }) }
  if (prix) g.t('PRIX TTC', X1 - 4, y + 5.4, { ...head, align: 'right' })
  let yy = y + 8
  for (const l of lignes) {
    const titre = g.lignes(l.label, g.f.gras, 10.5, largeur).slice(0, 2)
    const h = 4 + titre.length * 4.6 + (l.detail ? 4.4 : 0) + 0.6
    titre.forEach((s, i) => g.t(s, X0 + 4, yy + 6 + i * 4.6, { font: g.f.gras, size: 10.5, color: C.noir, maxWidth: largeur }))
    if (l.detail) g.t(l.detail, X0 + 4, yy + 6 + titre.length * 4.6 + 0.2, { size: 8.5, color: C.gris, maxWidth: largeur })
    if (colonnes) {
      g.t(l.ref || '—', xRef, yy + 6, { size: 9, maxWidth: 30 })
      g.t(l.qte != null ? String(l.qte) : '—', xQte, yy + 6, { size: 10, align: 'center' })
    }
    if (prix) g.t(euro(l.prix), X1 - 4, yy + 6, { font: g.f.gras, size: 10.5, align: 'right', color: C.noir })
    yy += h
    g.line(X0, yy, X1, yy)
  }
  return yy
}

function totaux(g, y, r, th) {
  const x = 120, w = 76
  g.t('Total TTC', x + 4, y + 6, { size: 10, color: C.gris })
  g.t(euro(r.total), x + w - 4, y + 6, { font: g.f.gras, size: 11, align: 'right', color: C.noir })
  g.t('Acompte versé', x + 4, y + 13, { size: 10, color: C.gris })
  g.t(r.acompte ? `- ${euro(r.acompte)}` : euro(0), x + w - 4, y + 13, { font: g.f.gras, size: 11, align: 'right', color: C.noir })
  g.round(x, y + 17, w, 14, 3, { color: th.accent })
  g.t('RESTE À PAYER', x + 5, y + 25.8, { font: g.f.titre, size: 8.5, color: th.surAccent })
  g.t(euro(r.reste), x + w - 5, y + 26.5, { font: g.f.titre, size: 15, align: 'right', color: th.surAccent, maxWidth: 40 })
  return y + 31
}

// Commande SAV : à la place des montants
function encartSav(g, y, th) {
  const x = 120, w = 76
  g.round(x, y, w, 24, 3, { color: th.accent })
  g.t('COMMANDE SAV', x + 5, y + 8.5, { font: g.f.titre, size: 10, color: th.surAccent })
  g.t('Aucun montant à régler', x + 5, y + 14.5, { font: g.f.gras, size: 10, color: th.surAccent })
  g.t('pour cette commande.', x + 5, y + 19, { size: 9.5, color: th.surAccent })
  return y + 24
}

// Étapes de la commande, autant qu'il en tient avant les signatures
function etapes(g, y, th, items, yMax) {
  const n = Math.max(1, Math.min(items.length, Math.floor((yMax - y - 12) / 10.5) + 1))
  g.t('COMMENT ÇA SE PASSE ?', X0, y + 4, { font: g.f.titre, size: 7.5, color: th.titre })
  items.slice(0, n).forEach(([titre, sous], i) => {
    const cy = y + 12 + i * 10.5
    if (i < n - 1) g.line(19, cy + 3.5, 19, cy + 7, C.trait, 0.6)
    g.circle(19, cy, 3.4, { color: th.accent, ...(th.accent === C.jaune ? { borderColor: C.noir, borderWidth: 0.6 * PT } : {}) })
    g.t(String(i + 1), 19, cy + 1.3, { font: g.f.titre, size: 8, align: 'center', color: th.surAccent })
    g.t(titre, 26, cy - 0.2, { font: g.f.gras, size: 9.5, color: C.noir })
    g.t(sous, 26, cy + 3.8, { size: 8, color: C.gris })
  })
}

// Signatures à 250 mm, descendues (jusqu'à 258) si les montants arrivent plus bas
const Y_SIGNATURES = 250
const ySignatures = finContenu => Math.min(258, Math.max(Y_SIGNATURES, finContenu + 4))
function pied(g, r, th, y) {
  for (const [x, l] of [[X0, 'Signature du client'], [110, 'Le vendeur']]) {
    g.round(x, y, 86, 22, 3, { borderColor: C.trait, borderWidth: 0.4 * PT, color: C.blanc })
    g.t(l, x + 4, y + 5.5, { size: 8, color: C.gris })
  }
  g.rect(0, 282, W, 15, th.pied)
  g.t('Présentez ce récapitulatif au retrait de votre commande.', X0, 289, { font: g.f.gras, size: 9, color: th.surPied })
  g.t(`Intersport${r.magasin ? ` ${r.magasin}` : ''} · document récapitulatif, ne vaut pas facture`, X0, 293.2, { size: 7.5, color: th.surPied })
}

// ── Documents ────────────────────────────────────────────────────────────────

function drawClient(g, r, [logo]) {
  const th = THEMES.client
  g.rect(0, 0, W, 40, C.bleu)
  g.rect(0, 40, W, 1.6, C.rouge)
  g.image(logo, X0, 13, 62)
  if (r.magasin) g.t(r.magasin, X0, 28, { font: g.f.titreM, size: 9, color: C.blanc, maxWidth: 80 })
  g.t('RÉCAPITULATIF', X1, 16, { font: g.f.titre, size: 15, color: C.blanc, align: 'right' })
  g.t(r.sav ? 'COMMANDE SAV' : 'DE COMMANDE', X1, 23, { font: g.f.titre, size: 15, color: C.blanc, align: 'right' })
  if (r.numero) {
    const s = `N° ${r.numero}`, w = Math.max(46, g.width(s, g.f.titre, 8.5) + 10)
    g.round(X1 - w, 27, w, 7.5, 3.75, { color: C.blanc })
    g.t(s, X1 - w / 2, 32.1, { font: g.f.titre, size: 8.5, color: C.bleu, align: 'center' })
  }
  intro(g, 55, `Voici le récapitulatif de votre commande${r.sav ? ' SAV' : ''}. Nous vous appelons dès qu’elle arrive en magasin.`)
  infos(g, 70, r, th)
  g.t('VOTRE COMMANDE', X0, 112, { font: g.f.titre, size: 7.5, color: th.titre })
  const yy = tableau(g, 115, r.lignes, th, { colonnes: true, prix: !r.sav })
  const ySig = ySignatures(r.sav ? encartSav(g, yy + 6, th) : totaux(g, yy + 6, r, th))
  etapes(g, yy + 6, th, [
    ['Commande passée', 'chez le fournisseur'], ['Réception en magasin', 'nous vérifions votre article'],
    ['On vous appelle', 'au numéro indiqué ci-dessus'], ['Retrait au magasin', 'avec ce récapitulatif'],
  ], ySig - 4)
  pied(g, r, th, ySig)
}

function drawObut(g, r, [logoObut, logoIs]) {
  const th = THEMES.obut
  g.rect(0, 0, W, 40, C.jaune)
  g.rect(0, 40, W, 9, C.noir)
  g.image(logoObut, X0, 7, 72)
  g.image(logoIs, 134, 13, 62)
  if (r.magasin) g.t(r.magasin, X1, 28, { font: g.f.titreM, size: 9, color: C.noir, align: 'right', maxWidth: 62 })
  g.t('RÉCAPITULATIF DE COMMANDE · BOULES SUR MESURE', X0, 46.2, { font: g.f.titre, size: 9, color: C.jaune })
  if (r.date) g.t(r.date, X1, 46.2, { font: g.f.titre, size: 9, color: C.jaune, align: 'right' })
  intro(g, 62, 'Vos boules sont fabriquées sur mesure par OBUT. Nous vous appelons dès leur arrivée en magasin.')
  infos(g, 76, r, th)

  // Vos boules : modèle en grand, caractéristiques, gravure
  const y = 112
  g.round(X0, y, X1 - X0, 40, 3, { borderColor: C.noir, borderWidth: 0.5 * PT, color: C.blanc })
  g.round(X0, y, 58, 40, 3, { color: C.noir })
  g.rect(60, y, 12, 40, C.noir)
  g.t('MODÈLE', 20, y + 9, { font: g.f.titre, size: 7, color: C.jaune })
  g.t(r.modele || '—', 20, y + 23, { font: g.f.titre, size: 20, color: C.blanc, maxWidth: 46 })
  ;[['DIAMÈTRE', r.diametre], ['POIDS', r.poids], ['STRIES', r.stries]].forEach(([l, v], i) => {
    const x = 80 + i * 27
    g.t(l, x, y + 9, { font: g.f.titre, size: 6.5, color: C.gris })
    g.t(v || '—', x, y + 17, { font: g.f.titre, size: 13, color: C.noir, maxWidth: 25 })
  })
  g.t('GRAVURE', 163, y + 9, { font: g.f.titre, size: 6.5, color: C.gris })
  g.t(r.marquage ? r.marquageLabel : 'Sans gravure', 163, y + 14.5, { size: 8.5, color: C.texte, maxWidth: 30 })
  if (r.marquage) {
    g.round(80, y + 23, 110, 12, 6, { color: C.jaune })
    g.t(`« ${r.marquage} »`, 135, y + 31.2, { font: g.f.titre, size: 13, color: C.noir, align: 'center', maxWidth: 100 })
  }

  g.t('DÉTAIL DU PRIX', X0, y + 50, { font: g.f.titre, size: 7.5, color: th.titre })
  const yy = tableau(g, y + 53, r.lignes, th, { colonnes: false })
  const ySig = ySignatures(totaux(g, yy + 5, r, th))
  etapes(g, yy + 5, th, [
    ['Commande passée chez OBUT', 'fabrication de vos boules'], ['Réception en magasin', 'contrôle du marquage'],
    ['On vous appelle', 'au numéro indiqué ci-dessus'], ['Retrait au magasin', 'avec ce récapitulatif'],
  ], ySig - 4)
  pied(g, r, th, ySig)
}

/**
 * PDF du récapitulatif (recapClient ou recapObut).
 * load(path) → Promise<ArrayBuffer|Uint8Array|null> : lit un fichier de public/.
 */
export async function renderRecapPdf(recap, load) {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(`Récapitulatif de commande${recap.numero ? ` ${recap.numero}` : ''}`)
  doc.setCreator('Atelier SAV')
  const fonts = Object.fromEntries(await Promise.all(Object.entries(FONTS).map(async ([k, p]) => [k, await doc.embedFont(await load(p), { subset: true })])))
  const logos = await Promise.all(LOGOS[recap.kind].map(async p => doc.embedPng(await load(p))))
  const page = doc.addPage([W * PT, H * PT])
  const g = outils(page, fonts)
  ;(recap.kind === 'obut' ? drawObut : drawClient)(g, recap, logos)
  return doc.save()
}

// Fichiers du site (dossier public/), gardés en mémoire pour les récapitulatifs suivants
const cache = new Map()
export function fetchPublic(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(`/${path}`).then(async res => {
      if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) throw new Error(`Fichier manquant : ${path}`)
      return new Uint8Array(await res.arrayBuffer())
    }).catch(e => { cache.delete(path); throw e }))
  }
  return cache.get(path)
}
