// Lien d'un dossier Google Drive (« https://drive.google.com/drive/folders/0AB… ») ou son identifiant
// → identifiant, null si illisible
export function dossierDriveId(v) {
  const s = String(v || '').trim()
  const m = s.match(/\/folders\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/) || s.match(/^([\w-]{10,})$/)
  return m ? m[1] : null
}
