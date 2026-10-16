// Google Drive (API REST v3) avec le compte de service des Cloud Functions : il doit être membre du Drive
// partagé des sauvegardes (Gestionnaire de contenu). Un compte de service n'a pas d'espace à lui : les
// fichiers vont dans un Drive partagé (supportsAllDrives).
const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const DOSSIER = 'application/vnd.google-apps.folder'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Jeton d'accès Drive du compte de service (serveur de métadonnées de Google Cloud)
async function jetonMetadonnees() {
  const r = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=https://www.googleapis.com/auth/drive',
    { headers: { 'Metadata-Flavor': 'Google' } })
  if (!r.ok) throw new Error(`Jeton Google Drive indisponible (${r.status})`)
  return (await r.json()).access_token
}

const echappe = v => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")

export function clientDrive({ jeton = jetonMetadonnees } = {}) {
  let token = null
  async function appel(url, init = {}) {
    token ??= await jeton()
    const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } })
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      const err = new Error(`Google Drive ${r.status} : ${detail.slice(0, 300)}`)
      err.status = r.status
      throw err
    }
    return r.json()
  }
  const lister = async q => {
    const out = []
    let page = ''
    do {
      const params = new URLSearchParams({
        q, fields: 'nextPageToken, files(id, name, appProperties)', pageSize: '1000',
        supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', corpora: 'allDrives',
      })
      if (page) params.set('pageToken', page)
      const r = await appel(`${API}?${params}`)
      out.push(...r.files)
      page = r.nextPageToken
    } while (page)
    return out
  }

  return {
    // Le dossier existe et le compte de service peut y écrire
    async verifier(dossierId) {
      return appel(`${API}/${encodeURIComponent(dossierId)}?supportsAllDrives=true&fields=id,name,capabilities(canAddChildren)`)
    },
    // Sous-dossier (trouvé ou créé) : un par budget
    async dossier(nom, parentId) {
      const [f] = await lister(`'${echappe(parentId)}' in parents and name = '${echappe(nom)}' and mimeType = '${DOSSIER}' and trashed = false`)
      if (f) return f.id
      const r = await appel(`${API}?supportsAllDrives=true&fields=id`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nom, mimeType: DOSSIER, parents: [parentId] }),
      })
      return r.id
    },
    // Fichiers d'un dossier (sauvegardes déjà faites, date dans appProperties)
    fichiers: parentId => lister(`'${echappe(parentId)}' in parents and mimeType != '${DOSSIER}' and trashed = false`),
    async envoyer({ nom, parentId, contenu, appProperties }) {
      const limite = `sauvegarde${Date.now()}`
      const meta = JSON.stringify({ name: nom, parents: [parentId], mimeType: XLSX, appProperties })
      const corps = Buffer.concat([
        Buffer.from(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${limite}\r\nContent-Type: ${XLSX}\r\n\r\n`),
        contenu,
        Buffer.from(`\r\n--${limite}--`),
      ])
      const r = await appel(`${UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id,name`, {
        method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${limite}` }, body: corps,
      })
      return r.id
    },
    // Mise à la corbeille du Drive partagé (récupérable pendant 30 jours)
    corbeille: id => appel(`${API}/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
    }),
  }
}
