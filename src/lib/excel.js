// Lit la première feuille d'un fichier Excel et renvoie ses lignes (tableau de tableaux).
// La librairie xlsx (~400 Ko) n'est téléchargée qu'au premier import de fichier.
export async function readSheetRows(file) {
  const [{ read, utils }, buffer] = await Promise.all([import('xlsx'), file.arrayBuffer()])
  const wb = read(new Uint8Array(buffer), { type: 'array' })
  return utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
}

// Comme readSheetRows, avec en plus la couleur de fond de chaque cellule (« RRGGBB » ou null) :
// fills[i][j] correspond à rows[i][j]. Les couleurs du thème Excel sont déjà converties en RGB.
export async function readSheetWithFills(file) {
  const [{ read, utils }, buffer] = await Promise.all([import('xlsx'), file.arrayBuffer()])
  const wb = read(new Uint8Array(buffer), { type: 'array', cellStyles: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true })
  const range = utils.decode_range(ws['!ref'] || 'A1')
  const fills = rows.map((row, i) => row.map((_, j) => {
    const s = ws[utils.encode_cell({ r: range.s.r + i, c: range.s.c + j })]?.s
    return s?.patternType && s.patternType !== 'none' && s.fgColor?.rgb ? s.fgColor.rgb.slice(-6).toUpperCase() : null
  }))
  return { rows, fills }
}

// Crée un classeur (une feuille par entrée { name, table }) et le télécharge.
// table : tableau de lignes, la première étant les en-têtes.
export async function downloadWorkbook(sheets, fileName) {
  const { utils, writeFile } = await import('xlsx')
  const wb = utils.book_new()
  for (const { name, table } of sheets) {
    const ws = utils.aoa_to_sheet(table)
    ws['!cols'] = table[0].map((_, j) => ({
      wch: Math.min(60, Math.max(10, ...table.map(r => String(r[j] ?? '').length + 2))),
    }))
    utils.book_append_sheet(wb, ws, name)
  }
  writeFile(wb, `${fileName}.xlsx`)
}

// Télécharge un fichier texte (CSV…)
export function downloadText(text, fileName, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
