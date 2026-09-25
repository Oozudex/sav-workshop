// Export des identifiants B2B (acheteur / direction générale) et ordre d'affichage des B2B.
// Fonctions pures : testées dans tests/unit/b2bExport.test.mjs

// Magasins qui ont des identifiants pour un B2B (liste non sensible stockée sur le B2B)
export function credentialStores(tool, magasins) {
  const ids = tool?.credentialStoreIds || []
  return magasins.filter(m => ids.includes(m.id))
}

// Une ligne par couple B2B × magasin sélectionné.
// creds : { [toolId]: { [magasinId]: { email, password } } }
// Les magasins non concernés par un B2B (storeIds renseigné sans eux) sont ignorés.
export function buildCredentialRows({ tools, magasins, creds, toolIds, storeIds, includeMissing = false }) {
  const rows = []
  const selectedTools = tools.filter(t => toolIds.includes(t.id))
  const selectedStores = magasins.filter(m => storeIds.includes(m.id))
  for (const t of selectedTools) {
    for (const m of selectedStores) {
      if (t.storeIds?.length && !t.storeIds.includes(m.id)) continue
      const c = creds[t.id]?.[m.id]
      const has = !!(c?.email || c?.password)
      if (!has && !includeMissing) continue
      rows.push({
        b2b: t.label || '',
        magasin: m.nom || m.id,
        identifiant: c?.email || '',
        motDePasse: c?.password || '',
        url: t.url || '',
        statut: has ? '' : 'Aucun identifiant',
      })
    }
  }
  return rows
}

export const EXPORT_COLUMNS = [
  ['b2b', 'B2B'], ['magasin', 'Magasin'], ['identifiant', 'Identifiant'],
  ['motDePasse', 'Mot de passe'], ['url', 'Adresse'], ['statut', 'Remarque'],
]

// Noms de feuille Excel : 31 caractères max, sans []:*?/\ et uniques
export function sheetName(name, used = new Set()) {
  const base = (String(name || 'Feuille').replace(/[[\]:*?/\\]/g, ' ').trim() || 'Feuille').slice(0, 31)
  let candidate = base
  for (let i = 2; used.has(candidate.toLowerCase()); i++) {
    const suffix = ` (${i})`
    candidate = base.slice(0, 31 - suffix.length) + suffix
  }
  used.add(candidate.toLowerCase())
  return candidate
}

// Feuilles du classeur : une seule, une par B2B ou une par magasin
export function groupRows(rows, by = 'aucun') {
  if (by === 'aucun') return [{ name: 'Identifiants', rows }]
  const key = by === 'b2b' ? 'b2b' : 'magasin'
  const groups = new Map()
  for (const r of rows) {
    if (!groups.has(r[key])) groups.set(r[key], [])
    groups.get(r[key]).push(r)
  }
  const used = new Set()
  return [...groups].map(([name, list]) => ({ name: sheetName(name, used), rows: list }))
}

// Tableau prêt pour le tableur (en-têtes français) ; sans la colonne Remarque si elle est vide partout
export function exportTable(rows) {
  const cols = EXPORT_COLUMNS.filter(([k]) => k !== 'statut' || rows.some(r => r.statut))
  return [cols.map(([, label]) => label), ...rows.map(r => cols.map(([k]) => r[k]))]
}

// CSV lisible par Excel en français : séparateur « ; », BOM UTF-8
export function toCsv(table) {
  const cell = v => {
    const s = String(v ?? '')
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '\uFEFF' + table.map(row => row.map(cell).join(';')).join('\r\n')
}

export function slug(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Nom du fichier selon la sélection : un B2B, un magasin, tout, ou une sélection
export function exportFileName({ tools, magasins, toolIds, storeIds, date = new Date() }) {
  const day = date.toISOString().slice(0, 10)
  const allTools = toolIds.length === tools.length
  const allStores = storeIds.length === magasins.length
  let scope = 'selection'
  if (allTools && allStores) scope = 'tous'
  else if (toolIds.length === 1 && allStores) scope = slug(tools.find(t => t.id === toolIds[0])?.label)
  else if (storeIds.length === 1 && allTools) scope = slug(magasins.find(m => m.id === storeIds[0])?.nom)
  else if (toolIds.length === 1 && storeIds.length === 1) {
    scope = `${slug(tools.find(t => t.id === toolIds[0])?.label)}-${slug(magasins.find(m => m.id === storeIds[0])?.nom)}`
  }
  return `identifiants-b2b-${scope || 'selection'}-${day}`
}

// Déplace un élément (ordre d'affichage)
export function moveItem(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

// Nouvel ordre : les principaux d'abord, puis les autres ; seuls les B2B dont l'ordre change sont renvoyés
export function orderChanges(featured, others) {
  return [...featured, ...others]
    .map((t, i) => ({ id: t.id, order: i, changed: t.order !== i }))
    .filter(x => x.changed)
    .map(({ id, order }) => ({ id, order }))
}
