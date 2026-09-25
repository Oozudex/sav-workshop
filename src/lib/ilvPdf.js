// Génération des ILV en PDF (A4 paysage), au plus près des modèles Piivo.
// Les positions viennent des ILV Piivo scannées à 300 dpi : millimètres depuis le coin haut gauche,
// y = ligne de base des textes. Les polices et images sont dans public/ilv/.
import {
  PDFDocument, rgb, pushGraphicsState, popGraphicsState, beginText, endText,
  setFontAndSize, setTextMatrix, setCharacterSpacing, showText, setFillingRgbColor,
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const PT = 72 / 25.4                 // points par millimètre
const W = 297, H = 210               // A4 paysage

const hex = h => rgb(...[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255))
export const ILV_COLORS = {
  rouge: '#CD102C',   // panneau « Bons plans », bloc « Prix promo », gros prix
  bleu:  '#164A8C',   // panneau « Prix engagé »
  vert:  '#81BC00',   // Oney
  texte: '#1D1D1B',
  gris:  '#3C3C3B',   // « /mois »
}
const C = Object.fromEntries(Object.entries(ILV_COLORS).map(([k, v]) => [k, hex(v)]))
C.blanc = rgb(1, 1, 1)

const FONTS = {
  sMedium:   'fonts/Saira-ILV-Medium.ttf',
  sSemiBold: 'fonts/Saira-ILV-SemiBold.ttf',
  sNarrow:   'fonts/Saira-ILV-SemiBold-Narrow.ttf',
  sBold:     'fonts/Saira-ILV-Bold.ttf',
  sBlack:    'fonts/Saira-ILV-Black.ttf',
  arial:     'fonts/Arimo-Regular.ttf',
  arialBold: 'fonts/Arimo-Bold.ttf',
  rcBlack:   'fonts/RobotoCondensed-ExtraBold.ttf',
  ssLight:   'fonts/SourceSans3-Light.ttf',
  ss:        'fonts/SourceSans3-Regular.ttf',
  ssBold:    'fonts/SourceSans3-Bold.ttf',
  mLight:    'fonts/Montserrat-Light.ttf',
  mMedium:   'fonts/Montserrat-Medium.ttf',
  mBold:     'fonts/Montserrat-Bold.ttf',
}

// Polices utilisées par chaque modèle (seules celles-ci sont chargées)
const FONTS_BY_TYPE = {
  normal:  ['arial', 'arialBold', 'rcBlack', 'ssLight', 'ss', 'ssBold', 'mLight', 'mMedium', 'mBold'],
  promo:   ['sMedium', 'sSemiBold', 'sNarrow', 'sBlack', 'arial', 'arialBold'],
  bonplan: ['sMedium', 'sSemiBold', 'arial', 'arialBold'],
  engage:  ['sMedium', 'sSemiBold', 'sBold', 'arial', 'arialBold'],
}

const IMAGES = {
  promo:   'badges/prix-promo.png',
  bonplan: 'badges/bons-plans.png',
  engage:  'badges/prix-engage.png',
  slogan:  'badges/slogan-prix-engage.png',
  oney:    'oney/logo.png',
  oney3:   'oney/3x.png',
  oney4:   'oney/4x.png',
  oney3t:  'oney/3x-texte.png',
  oney4t:  'oney/4x-texte.png',
}

// Logo de marque : public/ilv/logos/marques/<marque en minuscules, sans accents ni espaces>.png
export function brandLogoPath(marque) {
  const slug = String(marque || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return slug ? `logos/marques/${slug}.png` : null
}

// ── Outils de dessin (millimètres, origine en haut à gauche) ─────────────────────

function makeCtx(doc, page, fonts, images) {
  const fontKeys = new Map()
  const key = f => {
    if (!fontKeys.has(f)) fontKeys.set(f, page.node.newFontDictionary(f.name, f.ref))
    return fontKeys.get(f)
  }
  const fk = f => f.embedder.font // police fontkit (métriques des glyphes)

  const ctx = {
    fonts, images,
    // Largeur d'avance du texte (mm)
    width(str, font, size, { scaleX = 1, spacing = 0 } = {}) {
      return (font.widthOfTextAtSize(str, size * PT) / PT + spacing * [...str].length) * scaleX - spacing * scaleX
    },
    // Encre réelle du texte : décalage du bord gauche et bord droit par rapport à l'origine (mm)
    ink(str, font, size, { scaleX = 1, spacing = 0 } = {}) {
      const f = fk(font), run = f.layout(str), k = size / f.unitsPerEm * scaleX
      let x = 0, left = Infinity, right = -Infinity
      run.glyphs.forEach((g, i) => {
        const b = g.bbox
        if (b.maxX > b.minX) { left = Math.min(left, x + b.minX * k); right = Math.max(right, x + b.maxX * k) }
        x += run.positions[i].xAdvance * k + spacing * scaleX
      })
      return { left: left === Infinity ? 0 : left, right: right === -Infinity ? 0 : right }
    },
    // Taille réduite pour tenir dans maxWidth
    fit(str, font, size, maxWidth, opts) {
      const w = ctx.width(str, font, size, opts)
      return w > maxWidth ? size * maxWidth / w : size
    },
    text(str, { font, size, x, y, color = C.texte, align = 'left', scaleX = 1, spacing = 0, maxWidth }) {
      if (!str) return 0
      if (maxWidth) size = ctx.fit(str, font, size, maxWidth, { scaleX, spacing })
      const w = ctx.width(str, font, size, { scaleX, spacing })
      const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
      page.pushOperators(
        pushGraphicsState(),
        setFillingRgbColor(color.red, color.green, color.blue),
        beginText(),
        setFontAndSize(key(font), size * PT),
        setCharacterSpacing(spacing * PT),
        setTextMatrix(scaleX, 0, 0, 1, x0 * PT, (H - y) * PT),
        showText(font.encodeText(str)),
        endText(),
        popGraphicsState(),
      )
      return w
    },
    rect(x, y, w, h, color) {
      page.drawRectangle({ x: x * PT, y: (H - y - h) * PT, width: w * PT, height: h * PT, color })
    },
    // Chemin SVG en millimètres (coordonnées absolues de la page)
    path(d, { color, borderColor, borderWidth } = {}) {
      page.drawSvgPath(d, {
        x: 0, y: H * PT, scale: PT, color,
        borderColor, borderWidth: borderWidth ? borderWidth : undefined,
      })
    },
    circle(cx, cy, r, color) {
      page.drawCircle({ x: cx * PT, y: (H - cy) * PT, size: r * PT, color })
    },
    image(img, x, y, w, h) {
      page.drawImage(img, { x: x * PT, y: (H - y - h) * PT, width: w * PT, height: h * PT })
    },
    // Image posée à la même taille que son encre sur l'ILV d'origine
    imageBox(img, box) { ctx.image(img, box[0], box[1], box[2] - box[0], box[3] - box[1]) },
    // Image contenue dans une zone (proportions conservées)
    imageContain(img, [x0, y0, x1, y1], { alignX = 'center', alignY = 'center' } = {}) {
      const bw = x1 - x0, bh = y1 - y0, r = Math.min(bw / img.width, bh / img.height)
      const w = img.width * r, h = img.height * r
      const x = alignX === 'left' ? x0 : alignX === 'right' ? x1 - w : x0 + (bw - w) / 2
      const y = alignY === 'top' ? y0 : alignY === 'bottom' ? y1 - h : y0 + (bh - h) / 2
      ctx.image(img, x, y, w, h)
    },
  }
  return ctx
}

/**
 * Gros prix : partie entière, puis « € » (aligné sur le haut des chiffres) au-dessus des centimes « .98 ».
 * g : { font, color, center, baseline, intSize, euroSize, decSize, gap, euroOver: 'dot' | 'digits', maxWidth,
 *       intScaleX, euroScaleX, decScaleX (compression horizontale de chaque partie),
 *       euroFont (police du « € » si différente), euroDrop (haut du « € » sous le haut des chiffres, mm) }
 */
function drawBigPrice(ctx, { int, dec }, g) {
  const { font, color } = g
  const euroFont = g.euroFont || font
  const iS = { scaleX: g.intScaleX ?? 1 }, eS = { scaleX: g.euroScaleX ?? 1 }, dS = { scaleX: g.decScaleX ?? 1 }
  let { intSize, euroSize, decSize } = g
  const measure = () => {
    const iInk = ctx.ink(int, font, intSize, iS)
    const dInk = ctx.ink(dec, font, decSize, dS)
    const eInk = ctx.ink('€', euroFont, euroSize, eS)
    const decX = iInk.right + g.gap - dInk.left                    // origine des centimes
    const euroLeft = g.euroOver === 'digits'
      ? decX + ctx.width('.', font, decSize, dS) + ctx.ink(dec.slice(1), font, decSize, dS).left
      : decX + dInk.left
    const euroX = euroLeft - eInk.left
    const right = Math.max(decX + dInk.right, euroX + eInk.right)
    return { iInk, decX, euroX, left: iInk.left, right }
  }
  let m = measure()
  if (g.maxWidth && m.right - m.left > g.maxWidth) {
    const k = g.maxWidth / (m.right - m.left)
    intSize *= k; euroSize *= k; decSize *= k
    m = measure()
  }
  const x0 = g.center - (m.left + m.right) / 2
  const digitTop = g.baseline - 0.688 * intSize
  ctx.text(int, { font, size: intSize, x: x0, y: g.baseline, color, ...iS })
  ctx.text('€', { font: euroFont, size: euroSize, x: x0 + m.euroX, y: digitTop + (g.euroDrop || 0) + 0.696 * euroSize, color, ...eS })
  ctx.text(dec, { font, size: decSize, x: x0 + m.decX, y: g.baseline, color, ...dS })
}

// Logo de la marque, ou son nom si le logo n'est pas encore dans le dossier
function drawBrand(ctx, box, marque, align, fill) {
  const logo = ctx.images.marque
  if (logo && fill) {
    // Zone du logo Nakamura d'origine : un logo aux proportions voisines la remplit (±15 %)
    const [fx0, fy0, fx1, fy1] = fill
    const ratio = (logo.width / logo.height) / ((fx1 - fx0) / (fy1 - fy0))
    if (ratio > 0.85 && ratio < 1.15) return ctx.imageBox(logo, fill)
  }
  if (logo) ctx.imageContain(logo, box, align)
  else if (marque) {
    ctx.text(marque.toUpperCase(), {
      font: ctx.fonts.arialBold, size: (box[3] - box[1]) * 0.7, x: (box[0] + box[2]) / 2,
      y: (box[1] + box[3]) / 2 + (box[3] - box[1]) * 0.24, align: 'center', maxWidth: box[2] - box[0],
    })
  }
}

// ── Modèles ─────────────────────────────────────────────────────────────────────

function drawNormal(ctx, ilv) {
  const { fonts: f } = ctx
  drawBrand(ctx, [70, 16, 227, 40], ilv.marque, undefined, [86.4, 20.1, 208.9, 37.8])
  const maxWidth = 270
  ilv.lines.forEach((l, i) => ctx.text(l, { font: f.arialBold, size: 13.95, x: 148.3, y: [67.4, 81.8][i], align: 'center', scaleX: 0.956, maxWidth }))
  ctx.text(ilv.refLine, { font: f.arial, size: 4.76, x: 148.1, y: 91.3, align: 'center', maxWidth })
  for (let i = 0; i < 54; i++) ctx.circle(66.7 + i * 3.062, 97.65, 0.62, C.texte)
  drawBigPrice(ctx, ilv.big, {
    font: f.arialBold, color: C.texte, center: 148.85, baseline: 144.3,
    intSize: 43.4, euroSize: 18.3, decSize: 17.9, gap: 0.55, euroOver: 'digits', maxWidth: 200,
    intScaleX: 0.95, euroScaleX: 0.79, decScaleX: 0.84, euroDrop: 1.5,
  })
  if (ilv.oney) drawOney(ctx, ilv.oney)
}

function drawOney(ctx, { n, monthly, mentions }) {
  const { fonts: f, images: im } = ctx
  const [x0, y0, x1, y1] = [10.58, 159.17, 147.06, 198.87], r = 2.2, bw = 0.6
  // Cadre arrondi vert, panneau plein à gauche avec sa flèche
  const i = bw / 2
  ctx.path(`M${x0 + r},${y0 + i} H${x1 - r} Q${x1 - i},${y0 + i} ${x1 - i},${y0 + r} V${y1 - r} Q${x1 - i},${y1 - i} ${x1 - r},${y1 - i} H${x0 + r} Q${x0 + i},${y1 - i} ${x0 + i},${y1 - r} V${y0 + r} Q${x0 + i},${y0 + i} ${x0 + r},${y0 + i} Z`,
    { borderColor: C.vert, borderWidth: bw * PT })
  const px = 58.8, ay = 179.4, ah = 5.9
  ctx.path(`M${x0 + r},${y0} H${px} V${ay - ah} L${px + ah},${ay} L${px},${ay + ah} V${y1} H${x0 + r} Q${x0},${y1} ${x0},${y1 - r} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} Z`,
    { color: C.vert })
  // Panneau : « PAYEZ EN · 3x · sans frais · PAR CARTE BANCAIRE »
  ctx.text('PAYEZ EN', { font: f.mLight, size: 5.0, x: 33.93, y: 167.0, align: 'center', color: C.blanc, scaleX: 0.82 })
  ctx.circle(34.45, 173.05, 4.9, C.blanc)
  ctx.imageBox(n === 3 ? im.oney3t : im.oney4t, [29.55, 168.15, 39.35, 177.95])
  ctx.text('sans frais', { font: f.mMedium, size: 3.56, x: 34.25, y: 182.5, align: 'center', color: C.blanc, spacing: 0.58 })
  ctx.rect(23.4, 183.2, 21.7, 0.5, C.blanc)
  const par = 'PAR ', cb = 'CARTE BANCAIRE', ps = 3.45, psx = 0.854
  const wPar = ctx.width(par, f.mLight, ps, { scaleX: psx }), wCb = ctx.width(cb, f.mBold, ps, { scaleX: psx })
  const sx = 34.85 - (wPar + wCb) / 2
  ctx.text(par, { font: f.mLight, size: ps, x: sx, y: 189.1, color: C.blanc, scaleX: psx })
  ctx.text(cb, { font: f.mBold, size: ps, x: sx + wPar, y: 189.1, color: C.blanc, scaleX: psx })
  ctx.text('Pour plus de précisions,', { font: f.ssBold, size: 1.705, scaleX: 1.115, x: 34.7, y: 192.95, align: 'center', color: C.blanc })
  ctx.text('rapprochez-vous d’un conseiller', { font: f.ssBold, size: 1.705, scaleX: 1.115, x: 34.7, y: 195.2, align: 'center', color: C.blanc })
  // Pastille, mensualité, TAEG
  ctx.imageContain(n === 3 ? im.oney3 : im.oney4, [95.5, 161.0, 105.9, 171.4])
  const [int, dec] = monthly.split('€')
  const intS = { scaleX: 0.87 }
  const iInk = ctx.ink(int, f.rcBlack, 23.5, intS)
  // Montant centré comme sur l'original (513 de 76,0 à 105,4 mm) ; « €33 » collé en exposant
  const ix = 90.7 - (iInk.left + iInk.right) / 2
  ctx.text(int, { font: f.rcBlack, size: 23.5, x: ix, y: 189.1, color: C.vert, ...intS })
  const ex = ix + iInk.right + 0.9 - ctx.ink(`€${dec}`, f.rcBlack, 11.4).left
  ctx.text(`€${dec}`, { font: f.rcBlack, size: 11.4, x: ex, y: 181.55, color: C.vert })
  const mx = Math.max(122.0, ex + ctx.width(`€${dec}`, f.rcBlack, 11.4) - 1.1)
  const mw = ctx.text('/mois', { font: f.ssLight, size: 8.4, x: mx, y: 189.5, color: C.gris, scaleX: 1.035 })
  ctx.text('*', { font: f.ssLight, size: 4.2, x: mx + mw + 0.2, y: 185.6, color: C.gris })
  ctx.text('TAEG 0%', { font: f.ss, size: 3.9, x: 102.55, y: 196.3, align: 'center', color: C.texte })
  // Mentions légales, lignes identiques à l'ILV d'origine
  ctx.imageBox(im.oney, [154.3, 160.8, 165.3, 164.5])
  const ls = 3.95, lsx = 117.6 / ctx.width(mentions[0], f.ss, ls)
  mentions.forEach((l, k) => ctx.text(l, { font: f.ss, size: ls, x: 166.9, y: 163.5 + k * 4.02, scaleX: lsx }))
}

// Colonne de droite des modèles « Bons plans » et « Prix engagé »
function drawSideColumn(ctx, ilv, lx) {
  const { fonts: f } = ctx
  drawBigPrice(ctx, ilv.big, {
    font: f.sSemiBold, color: C.rouge, center: 199.7, baseline: 121.7,
    intSize: 79.4, euroSize: 39.4, decSize: 29.8, gap: 3.4, euroOver: 'dot', maxWidth: 160,
    intScaleX: 0.968, euroScaleX: 1.15, decScaleX: 0.913,
  })
  // Détail du prix agrandi (lisible par le client) ; logo réduit pour lui laisser la place
  drawBrand(ctx, [123.6, 141, 172, 170], ilv.marque, { alignX: 'left' })
  const x = lx - 26
  ilv.lines.forEach((l, i) => ctx.text(l, { font: f.sMedium, size: 9.5, x, y: 141 + i * 10.4, scaleX: 0.962, maxWidth: 292 - x }))
  ctx.text(ilv.refLine, { font: f.arial, size: 5, x, y: 141 + ilv.lines.length * 10.4 - 0.6, scaleX: 0.945, maxWidth: 292 - x })
}

function drawBonPlan(ctx, ilv) {
  const { fonts: f, images: im } = ctx
  ctx.rect(4.7, 4.5, 104.3, 200.6, C.rouge)
  ctx.imageBox(im.bonplan, [15.1, 85.9, 98.8, 122.8])
  ctx.text(ilv.conseille, { font: f.sSemiBold, size: 13.37, x: 125.5, y: 39.0, maxWidth: 165 })
  drawSideColumn(ctx, ilv, 205.2)
}

function drawEngage(ctx, ilv) {
  const { fonts: f, images: im } = ctx
  ctx.rect(4.3, 4.2, 101.8, 200.7, C.bleu)
  ctx.imageBox(im.engage, [6.2, 28.1, 96.2, 65.4])
  ctx.imageBox(im.slogan, [12.2, 104.6, 95.7, 160.0])
  ctx.text(ilv.conseille, { font: f.sSemiBold, size: 13.37, x: 125.2, y: 38.9, maxWidth: 165 })
  ctx.text('Prix engagé :', { font: f.sBold, size: 13.37, x: 125.3, y: 59.1, color: C.bleu, scaleX: 0.977 })
  drawSideColumn(ctx, ilv, 204.7)
}

function drawPromo(ctx, ilv) {
  const { fonts: f, images: im } = ctx
  ctx.imageBox(im.promo, [15.2, 16.8, 105.1, 55.8])
  ctx.rect(138.4, 50.1, 134.9, 133.9, C.rouge)
  ctx.rect(202.9, 42.7, 79.8, 42.2, C.rouge)
  ctx.rect(208.1, 45.1, 72.1, 33.6, C.blanc)
  // Prix barré (pack inclus) et remise
  const bw = ctx.text(ilv.barre, { font: f.sMedium, size: 18.7, x: 144.0, y: 73.1, color: C.blanc, scaleX: 1.073, maxWidth: 57 })
  ctx.rect(143.4, 66.1, bw + 1.2, 0.75, C.blanc)
  ctx.text(ilv.remise, { font: f.sBlack, size: 30.0, x: 244.15, y: 73.26, align: 'center', color: C.rouge, scaleX: 0.919, maxWidth: 68 })
  drawBigPrice(ctx, ilv.big, {
    font: f.sNarrow, color: C.blanc, center: 206.55, baseline: 154.8,
    intSize: 77.2, euroSize: 38.1, decSize: 29.1, gap: 5.6, euroOver: 'dot', maxWidth: 135,
    intScaleX: 0.934, decScaleX: 0.958, euroFont: f.sSemiBold, euroDrop: 0.8,
  })
  ctx.text(ilv.dates, { font: f.sMedium, size: 5.33, x: 206.15, y: 197.8, align: 'center', scaleX: 1.112 })
  // Détail à gauche
  // Détail du prix agrandi (lisible par le client) ; logo réduit pour lui laisser la place
  const pitch = ilv.lines.length > 3 ? 9.4 : 10.4
  ilv.lines.forEach((l, i) => ctx.text(l, { font: f.sMedium, size: 8.8, x: 16, y: 100 + i * pitch, maxWidth: 118 }))
  ctx.text(ilv.refLine, { font: f.arial, size: 4.8, x: 16, y: 100 + ilv.lines.length * pitch - 0.8, scaleX: 0.958, maxWidth: 118 })
  drawBrand(ctx, [16, 156, 72, 178], ilv.marque, { alignX: 'left' })
}

const DRAW = { normal: drawNormal, promo: drawPromo, bonplan: drawBonPlan, engage: drawEngage }

/**
 * Crée le PDF d'une ILV (résultat de buildIlv).
 * load(path) → Promise<ArrayBuffer|Uint8Array|null> : lit un fichier de public/ilv/ (null s'il n'existe pas).
 */
export async function renderIlvPdf(ilv, load) {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(`ILV ${ilv.type} ${ilv.refLine}`)
  doc.setCreator('Atelier SAV')
  const page = doc.addPage([W * PT, H * PT])

  const fontEntries = await Promise.all(FONTS_BY_TYPE[ilv.type].map(async k =>
    [k, await doc.embedFont(await load(FONTS[k]), { subset: true })]))
  const wanted = { normal: ['oney', 'oney3', 'oney4', 'oney3t', 'oney4t'], promo: ['promo'], bonplan: ['bonplan'], engage: ['engage', 'slogan'] }[ilv.type]
  const imageEntries = await Promise.all(wanted.map(async k => [k, await doc.embedPng(await load(IMAGES[k]))]))
  const logoPath = brandLogoPath(ilv.marque)
  const logoBytes = logoPath ? await load(logoPath) : null
  if (logoBytes) imageEntries.push(['marque', await doc.embedPng(logoBytes)])

  const ctx = makeCtx(doc, page, Object.fromEntries(fontEntries), Object.fromEntries(imageEntries))
  DRAW[ilv.type](ctx, ilv)
  return doc.save()
}

// Chargement depuis le site (dossier public/ilv/), gardé en mémoire pour les ILV suivantes
const assetCache = new Map()
export function fetchIlvAsset(path) {
  if (!assetCache.has(path)) {
    assetCache.set(path, fetch(`/ilv/${path}`).then(async res => {
      const type = res.headers.get('content-type') || ''
      // Fichier absent : 404, ou repli du serveur sur index.html
      if (!res.ok || type.includes('text/html')) return null
      return new Uint8Array(await res.arrayBuffer())
    }).catch(() => { assetCache.delete(path); return null }))
  }
  return assetCache.get(path)
}
