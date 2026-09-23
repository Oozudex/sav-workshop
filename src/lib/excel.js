// Lit la première feuille d'un fichier Excel et renvoie ses lignes (tableau de tableaux).
// La librairie xlsx (~400 Ko) n'est téléchargée qu'au premier import de fichier.
export async function readSheetRows(file) {
  const [{ read, utils }, buffer] = await Promise.all([import('xlsx'), file.arrayBuffer()])
  const wb = read(new Uint8Array(buffer), { type: 'array' })
  return utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
}
