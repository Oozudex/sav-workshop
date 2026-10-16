// Classeur Excel (une feuille par entrée { name, table }) construit avec la librairie xlsx (utils), pour
// le téléchargement dans le navigateur (excel.js) et la sauvegarde automatique côté serveur.
// table : tableau de lignes, la première étant les en-têtes. Facultatif : merges (cellules fusionnées),
// formats ({ colonne: format Excel } appliqué aux nombres à partir de la ligne firstRow), widthFrom
// (largeur des colonnes calculée à partir de cette ligne, pour ne pas compter un titre au-dessus).
export function remplirClasseur(utils, sheets) {
  const wb = utils.book_new()
  for (const { name, table, merges, formats, firstRow = 1, widthFrom = 0 } of sheets) {
    const ws = utils.aoa_to_sheet(table)
    const width = Math.max(...table.map(r => r.length))
    ws['!cols'] = Array.from({ length: width }, (_, j) => ({
      wch: Math.min(60, Math.max(10, ...table.slice(widthFrom).map(r => String(r[j] ?? '').length + 2))),
    }))
    if (merges?.length) ws['!merges'] = merges
    for (const [col, z] of Object.entries(formats || {})) {
      for (let r = firstRow; r < table.length; r++) {
        const c = ws[utils.encode_cell({ r, c: Number(col) })]
        if (c?.t === 'n') c.z = z
      }
    }
    utils.book_append_sheet(wb, ws, name)
  }
  return wb
}
