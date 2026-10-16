// Sauvegarde automatique des budgets sur Google Drive (Cloud Functions sauvegardeBudgets, chaque nuit, et
// sauvegarderBudgetsMaintenant). Réglage : budget_reglages/sauvegardes { dossierId } (Drive partagé).
// Un budget n'est envoyé que si son contenu a changé depuis sa dernière sauvegarde (budgets/{id}.sauvegarde).
// Dépendances passées en paramètres (base, Drive, export Excel) : testable avec l'émulateur et un faux Drive.
import { empreinteBudget, jourParis, sauvegardesAJeter } from './lib.js'

const liste = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }))

export async function sauvegarderBudgets({ db, drive, budgetExcel, budgetsAvant, maintenant = new Date(), FieldValue }) {
  const reglageRef = db.doc('budget_reglages/sauvegardes')
  const dossierId = (await reglageRef.get()).get('dossierId')
  if (!dossierId) return { statut: 'sans-dossier', sauvegardes: [] }
  const jour = jourParis(maintenant)
  const resultat = { statut: 'ok', sauvegardes: [], inchanges: 0, jetes: 0 }
  try {
    await drive.verifier(dossierId)
    const [budgetsSnap, brands, univers, magasins, notation, fournisseurs] = await Promise.all([
      db.collection('budgets').get(), db.collection('budget_marques').get(), db.collection('budget_univers').orderBy('ordre').get(),
      db.collection('budget_magasins').orderBy('ordre').get(), db.doc('budget_reglages/notation').get(), db.doc('budget_reglages/fournisseurs').get(),
    ])
    const budgets = liste(budgetsSnap).filter(b => !b.suppression)
    const commun = {
      brands: liste(brands), universList: liste(univers), magasins: liste(magasins), budgets,
      reglages: notation.exists ? notation.data() : null, liens: fournisseurs.get('liens') || {},
    }
    const fichesDe = new Map()
    const fiches = async id => {
      if (!fichesDe.has(id)) fichesDe.set(id, liste(await db.collection(`budgets/${id}/fournisseurs`).get()))
      return fichesDe.get(id)
    }
    for (const budget of budgets) {
      const lines = liste(await db.collection(`budgets/${budget.id}/marques`).get())
      const history = []
      for (const b of budgetsAvant(budgets, budget)) history.push({ budget: b, list: await fiches(b.id) })
      const data = { ...commun, budget, lines, fiches: await fiches(budget.id), history }
      const empreinte = empreinteBudget(data)
      if (budget.sauvegarde?.empreinte === empreinte) { resultat.inchanges++; continue }

      const sousDossier = await drive.dossier(budget.nom, dossierId)
      const heure = maintenant.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
      const nom = `${budget.nom} - sauvegarde ${jour} ${heure}.xlsx`
      await drive.envoyer({ nom, parentId: sousDossier, contenu: budgetExcel(data), appProperties: { budgetId: budget.id, date: jour } })
      await db.doc(`budgets/${budget.id}`).update({ sauvegarde: { at: FieldValue.serverTimestamp(), fichier: nom, empreinte } })
      resultat.sauvegardes.push(nom)

      // On garde les 30 derniers jours, puis la dernière sauvegarde de chaque mois
      const existants = (await drive.fichiers(sousDossier)).map(f => ({ id: f.id, date: f.appProperties?.date }))
      for (const id of sauvegardesAJeter(existants, jour)) { await drive.corbeille(id); resultat.jetes++ }
    }
  } catch (err) {
    resultat.statut = 'erreur'
    resultat.erreur = err.status === 404 || err.status === 403
      ? 'Dossier Google Drive introuvable ou non partagé avec le compte de l’application (Gestionnaire de contenu).'
      : String(err.message || err).slice(0, 300)
  }
  await reglageRef.set({
    dernier: { at: FieldValue.serverTimestamp(), statut: resultat.statut, sauvegardes: resultat.sauvegardes.length, erreur: resultat.erreur || null },
  }, { merge: true })
  return resultat
}
