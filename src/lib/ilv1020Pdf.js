// ILV 10×20 en PDF : une feuille A4 portrait par chevalet, deux faces de 20 × 10 cm l'une au-dessus de
// l'autre (celle du haut à l'envers, pour plier la feuille en chevalet). Tout est redessiné d'après les
// modèles du magasin (positions relevées sur les PDF d'origine, en mm depuis le coin haut gauche de la face,
// y = ligne de base des textes). Polices et images dans public/ilv/.
import {
  PDFDocument, PDFName, PDFOperator, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix,
  rectangle, clip, endPath, beginText, endText, setFontAndSize, setTextMatrix, setCharacterSpacing, showText,
  setFillingRgbColor, setStrokingRgbColor, setLineWidth, setLineJoin, LineJoinStyle, setTextRenderingMode,
  TextRenderingMode,
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { textes1020 } from './ilv1020.js'

const PT = 72 / 25.4                 // points par millimètre
const PAGE = [210, 297]              // A4 portrait
const FACE = [200, 100]              // une face du chevalet
const X0 = 5, Y_HAUT = 9             // coin haut gauche de la face du haut (la seconde est juste dessous)

const hex = h => rgb(...[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255))
const C = {
  rouge: hex('#E30613'),
  jaune: hex('#FFED00'),
  vert: hex('#BFD730'),
  noir: hex('#1D1D1B'),
  blanc: rgb(1, 1, 1),
  trait: hex('#B4B4B4'),           // contour de découpe
}
// Dégradé du bandeau « presque parfaits » : lavande en bas à gauche → bleu Intersport en haut à droite
const DEGRADE_PP = ['#9C89C0', '#5E67AF', '#0C4EA2']

const FONTS = {
  sBlack: 'fonts/Saira-ILV-Black.ttf',
  sBold: 'fonts/Saira-ILV-Bold.ttf',
  sSemiBold: 'fonts/Saira-ILV-SemiBold.ttf',
  sMedium: 'fonts/Saira-ILV-Medium.ttf',
  mBold: 'fonts/Montserrat-Bold.ttf',
}
const IMAGES = {
  carte: '1020/carte-cadeau.png',
  prixPromo: '1020/prix-promo-blanc.png',   // logo « PRIX PROMO » des ILV, passé en blanc
}
const BESOINS = {
  promo: { fonts: ['sBlack'], images: [] },
  soldes: { fonts: ['mBold'], images: [] },
  carte_cadeau: { fonts: ['sBold', 'sMedium', 'sSemiBold'], images: ['carte'] },
  prix_promo: { fonts: [], images: ['prixPromo'] },
  presque_parfait: { fonts: ['sBlack', 'sBold', 'sMedium'], images: [] },
}

// ── Outils de dessin dans une face (mm, origine en haut à gauche de la face) ──────

function makeFace(page, fonts, images, shading) {
  const [, FH] = FACE
  const fontKeys = new Map()
  const key = f => {
    if (!fontKeys.has(f)) fontKeys.set(f, page.node.newFontDictionary(f.name, f.ref))
    return fontKeys.get(f)
  }
  const fk = f => f.embedder.font
  const ctx = {
    fonts, images,
    // Taille de police (mm) pour une hauteur de capitales donnée
    tailleCap: (font, cap) => cap * fk(font).unitsPerEm / fk(font).capHeight,
    width: (str, font, size, scaleX = 1) => font.widthOfTextAtSize(str, size * PT) / PT * scaleX,
    // Encre réelle du texte : bords gauche et droit par rapport à l'origine (mm)
    ink(str, font, size, scaleX = 1) {
      const f = fk(font), run = f.layout(str), k = size / f.unitsPerEm * scaleX
      let x = 0, left = Infinity, right = -Infinity
      run.glyphs.forEach((g, i) => {
        const b = g.bbox
        if (b.maxX > b.minX) { left = Math.min(left, x + b.minX * k); right = Math.max(right, x + b.maxX * k) }
        x += run.positions[i].xAdvance * k
      })
      return { left: left === Infinity ? 0 : left, right: right === -Infinity ? 0 : right }
    },
    /**
     * Texte sur sa ligne de base. align : 'left' | 'center' | 'right' (sur l'encre, pas sur l'avance) ;
     * skew : pente de l'italique ; gras : contour (mm) du même ton pour épaissir les lettres ;
     * largeur : largeur d'encre imposée (mm), obtenue en étirant ou en serrant les lettres.
     */
    text(str, { font, size, x, y, color = C.noir, align = 'left', scaleX = 1, skew = 0, gras = 0, spacing = 0, largeur }) {
      if (largeur) { const i = ctx.ink(str, font, size); scaleX = (largeur - gras) / (i.right - i.left) }
      const ink = ctx.ink(str, font, size, scaleX)
      const x0 = align === 'center' ? x - (ink.left + ink.right) / 2 : align === 'right' ? x - ink.right : x - ink.left
      const ops = [pushGraphicsState(), setFillingRgbColor(color.red, color.green, color.blue)]
      if (gras) ops.push(setStrokingRgbColor(color.red, color.green, color.blue), setLineWidth(gras * PT),
        setLineJoin(LineJoinStyle.Round), setTextRenderingMode(TextRenderingMode.FillAndOutline))
      page.pushOperators(...ops,
        beginText(),
        setFontAndSize(key(font), size * PT),
        setCharacterSpacing(spacing * PT),
        setTextMatrix(scaleX, 0, skew, 1, x0 * PT, (FH - y) * PT),
        showText(font.encodeText(str)),
        endText(),
        popGraphicsState(),
      )
      return { left: x0 + ink.left, right: x0 + ink.right }
    },
    rect(x, y, w, h, color) {
      page.drawRectangle({ x: x * PT, y: (FH - y - h) * PT, width: w * PT, height: h * PT, color })
    },
    roundRect(x, y, w, h, r, color) {
      page.drawSvgPath(`M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`,
        { x: 0, y: FH * PT, scale: PT, color })
    },
    circle(cx, cy, r, color) {
      page.drawCircle({ x: cx * PT, y: (FH - cy) * PT, size: r * PT, color })
    },
    // Image contenue dans une zone (proportions conservées), centrée
    image(img, [x0, y0, x1, y1]) {
      const r = Math.min((x1 - x0) / img.width, (y1 - y0) / img.height)
      const w = img.width * r, h = img.height * r
      page.drawImage(img, { x: (x0 + (x1 - x0 - w) / 2) * PT, y: (FH - y0 - (y1 - y0 + h) / 2) * PT, width: w * PT, height: h * PT })
    },
    // Dessins tournés de deg degrés (sens inverse des aiguilles d'une montre) autour de (cx, cy)
    tourne(cx, cy, deg, dessin) {
      const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
      const px = cx * PT, py = (FH - cy) * PT
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(c, s, -s, c, px - c * px + s * py, py - s * px - c * py))
      dessin()
      page.pushOperators(popGraphicsState())
    },
    // Rectangle rempli par le dégradé du document
    degrade(x, y, w, h) {
      page.pushOperators(pushGraphicsState(), rectangle(x * PT, (FH - y - h) * PT, w * PT, h * PT), clip(), endPath(),
        PDFOperator.of('sh', [shading(page)]), popGraphicsState())
    },
  }
  return ctx
}

/**
 * Montant en très gros, centré : hauteur de capitales du modèle, lettres étirées comme sur le modèle
 * (reference : [texte du modèle, sa largeur en mm]), réduit s'il est trop large pour la zone.
 */
function grosTexte(ctx, str, { font, cap, cx, baseline, maxWidth, reference, color, gras = 0 }) {
  let size = ctx.tailleCap(font, cap)
  const r = ctx.ink(reference[0], font, size)
  const scaleX = (reference[1] - gras) / (r.right - r.left)
  const ink = ctx.ink(str, font, size, scaleX)
  const w = ink.right - ink.left + gras
  if (w > maxWidth) size *= maxWidth / w
  const k = size / ctx.tailleCap(font, cap)
  // Réduit : reste centré verticalement sur la même hauteur
  const y = baseline - (cap - cap * k) / 2
  ctx.text(str, { font, size, x: cx, y, align: 'center', scaleX, color, gras: gras * k })
}

// ── Modèles (une face, 200 × 100 mm) ───────────────────────────────────────────

function drawPromo(ctx, { montant }) {
  const f = ctx.fonts
  ctx.circle(34.6, 48.3, 28.6, C.rouge)
  ctx.text('PROMO', { font: f.sBlack, size: ctx.tailleCap(f.sBlack, 10.4), x: 34.6, y: 53.9, align: 'center', largeur: 46, color: C.jaune, gras: 0.3 })
  grosTexte(ctx, textes1020('promo', montant).grand, { font: f.sBlack, cap: 32.4, cx: 129, baseline: 67, maxWidth: 118, reference: ['-20€', 94.5], color: C.rouge, gras: 1 })
}

function drawSoldes(ctx, { montant }) {
  const f = ctx.fonts
  for (const [y, base] of [[0, 8.9], [87.8, 96.6]]) {
    ctx.rect(0, y, 200, 12.2, C.rouge)
    // Cinq « SOLDES » régulièrement espacés
    for (let i = 0; i < 5; i++) {
      ctx.text('SOLDES', { font: f.mBold, size: ctx.tailleCap(f.mBold, 5.6), x: 24.8 + i * 37.6, y: base, align: 'center', color: C.blanc, gras: 0.25 })
    }
  }
  grosTexte(ctx, textes1020('soldes', montant).grand, { font: f.mBold, cap: 47.2, cx: 101, baseline: 76, maxWidth: 184, reference: ['-200€', 179.7], color: C.rouge, gras: 3 })
}

function drawCarteCadeau(ctx, { montant }) {
  const f = ctx.fonts
  const { grand, petit } = textes1020('carte_cadeau', montant)
  ctx.roundRect(2.7, 15.2, 181.3, 49.4, 5, C.rouge)
  grosTexte(ctx, grand, { font: f.sBold, cap: 14.1, cx: 63.4, baseline: 39.1, maxWidth: 112, reference: ['100€ OFFERTS', 107.7], color: C.blanc, gras: 0.5 })
  ctx.text(petit, { font: f.sMedium, size: ctx.tailleCap(f.sMedium, 9), x: 63.2, y: 55.5, align: 'center', largeur: 73.5, color: C.blanc })
  ctx.image(ctx.images.carte, [121.5, 6.5, 201.5, 70.5])
  ctx.text('*POUR L’ACHAT DE CE VÉLO', { font: f.sSemiBold, size: ctx.tailleCap(f.sSemiBold, 4.4), x: 93.4, y: 80, align: 'center', color: C.noir })
}

function drawPrixPromo(ctx) {
  // Lettres de « PROMO » transparentes dans le logo : elles prennent le rouge du fond
  ctx.rect(0, 0, 200, 100, C.rouge)
  ctx.image(ctx.images.prixPromo, [22.5, 17.5, 187.5, 93.5])
}

function drawPresqueParfait(ctx) {
  const f = ctx.fonts
  const ital = Math.tan(12 * Math.PI / 180)
  ctx.degrade(0, 24, 200, 76)
  const x = 28.2
  ctx.text('LES', { font: f.sBlack, size: ctx.tailleCap(f.sBlack, 4.6), x, y: 34, color: C.blanc, skew: ital })
  const velos = ctx.text('VÉLOS', { font: f.sBlack, size: ctx.tailleCap(f.sBlack, 11), x, y: 47.9, largeur: 50, color: C.blanc, skew: ital })
  ctx.text('(PRESQUE)', { font: f.sBold, size: ctx.tailleCap(f.sBold, 6.4), x: velos.right + 2.4, y: 47.6, largeur: 38, color: C.vert, skew: ital })
  // « PARFAITS », le A en vert
  const sizeP = ctx.tailleCap(f.sBlack, 17.5), i = ctx.ink('PARFAITS', f.sBlack, sizeP), sx = 96 / (i.right - i.left)
  let cx = x
  for (const [t, color] of [['P', C.blanc], ['A', C.vert], ['RFAITS', C.blanc]]) {
    ctx.text(t, { font: f.sBlack, size: sizeP, x: cx, y: 68.5, color, scaleX: sx })
    cx += ctx.width(t, f.sBlack, sizeP, sx)
  }
  const by = ctx.text('by ', { font: f.sBold, size: ctx.tailleCap(f.sBold, 5), x: cx + 2.5, y: 68.5, color: C.blanc })
  ctx.text('INTERSPORT', { font: f.sBlack, size: ctx.tailleCap(f.sBlack, 5), x: by.right + 1.3, y: 68.5, color: C.blanc })
  // Accroche entre deux lignes pointillées
  for (const y of [77.6, 87]) for (let px = x; px <= 171; px += 0.95) ctx.circle(px, y, 0.22, C.blanc)
  const accroche = 'À CE PRIX, UNE PETITE IMPERFECTION ESTHÉTIQUE DEVIENT UNE QUALITÉ'
  const sA = ctx.tailleCap(f.sMedium, 4)
  const largeur = ctx.ink(accroche, f.sMedium, sA).right
  ctx.text(accroche, { font: f.sMedium, size: sA, x, y: 84.4, color: C.blanc, skew: ital, scaleX: Math.min(1, 142 / largeur) })
  // Pastille verte, légèrement tournée
  ctx.tourne(165, 27.5, 7, () => {
    ctx.roundRect(147.5, 15, 35, 25, 5, C.vert)
    const lignes = ['MÊME', 'PERFORMANCE,', 'SEUL LE PRIX', 'CHANGE !']
    const s = ctx.tailleCap(f.sBlack, 3.3)
    lignes.forEach((l, i) => ctx.text(l, { font: f.sBlack, size: s, x: 151, y: 21.6 + i * 4.6, color: C.blanc, scaleX: 0.92 }))
  })
}

const DRAW = { promo: drawPromo, soldes: drawSoldes, carte_cadeau: drawCarteCadeau, prix_promo: drawPrixPromo, presque_parfait: drawPresqueParfait }

// Dégradé axial (fonction de raccord entre trois couleurs), enregistré une fois par page sous /Sh1
function makeShading(doc) {
  const col = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
  const [a, b, c] = DEGRADE_PP.map(col)
  const lin = (c0, c1) => ({ FunctionType: 2, Domain: [0, 1], C0: c0, C1: c1, N: 1 })
  // Du coin bas gauche au coin haut droit du bandeau (repère de la face, en points, y vers le haut)
  const ref = doc.context.register(doc.context.obj({
    ShadingType: 2, ColorSpace: 'DeviceRGB', Extend: [true, true],
    Coords: [0, 0, FACE[0] * PT, 76 * PT],
    Function: { FunctionType: 3, Domain: [0, 1], Functions: [lin(a, b), lin(b, c)], Bounds: [0.5], Encode: [0, 1, 0, 1] },
  }))
  const pages = new WeakSet()
  return page => {
    const nom = PDFName.of('Sh1')
    if (!pages.has(page)) {
      const res = page.node.normalizedEntries().Resources
      let dict = res.lookup(PDFName.of('Shading'))
      if (!dict) { dict = doc.context.obj({}); res.set(PDFName.of('Shading'), dict) }
      dict.set(nom, ref)
      pages.add(page)
    }
    return nom
  }
}

/**
 * PDF des chevalets : pages = [{ modele, montant }] (voir pages1020), une feuille A4 chacun.
 * load(path) → Promise<ArrayBuffer|Uint8Array|null> : lit un fichier de public/ilv/.
 */
export async function renderIlv1020Pages(pages, load, title) {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(title || 'ILV 10×20')
  doc.setCreator('Atelier SAV')
  const fonts = new Map(), images = new Map()
  const font = k => { if (!fonts.has(k)) fonts.set(k, load(FONTS[k]).then(b => doc.embedFont(b, { subset: true }))); return fonts.get(k) }
  const image = k => { if (!images.has(k)) images.set(k, load(IMAGES[k]).then(b => doc.embedPng(b))); return images.get(k) }
  const shading = makeShading(doc)
  const [W, H] = FACE

  for (const p of pages) {
    const besoin = BESOINS[p.modele]
    if (!besoin) continue
    const fontsP = Object.fromEntries(await Promise.all(besoin.fonts.map(async k => [k, await font(k)])))
    const imagesP = Object.fromEntries(await Promise.all(besoin.images.map(async k => [k, await image(k)])))
    const page = doc.addPage([PAGE[0] * PT, PAGE[1] * PT])
    const ctx = makeFace(page, fontsP, imagesP, shading)
    // Face du bas à l'endroit, face du haut tournée d'un demi-tour ; chacune découpée à sa taille
    const bas = (PAGE[1] - Y_HAUT - 2 * H) * PT
    for (const [a, d, e, f] of [[1, 1, X0 * PT, bas], [-1, -1, (X0 + W) * PT, bas + 2 * H * PT]]) {
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(a, 0, 0, d, e, f),
        rectangle(0, 0, W * PT, H * PT), clip(), endPath())
      DRAW[p.modele](ctx, p)
      page.pushOperators(popGraphicsState())
    }
    // Contour de découpe et pli
    const trait = { borderColor: C.trait, borderWidth: 0.25 * PT }
    page.drawRectangle({ x: X0 * PT, y: bas, width: W * PT, height: 2 * H * PT, ...trait })
    page.drawLine({ start: { x: X0 * PT, y: bas + H * PT }, end: { x: (X0 + W) * PT, y: bas + H * PT }, thickness: 0.25 * PT, color: C.trait })
  }
  return doc.save()
}
