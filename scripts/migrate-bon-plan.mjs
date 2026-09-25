#!/usr/bin/env node
/**
 * Migration unique : « exclu team » devient « bon plan ».
 *
 * - prix_exclu_team/{id aléatoire} → prix_bon_plan/{chrono} (un seul document par chrono :
 *   le plus récent l'emporte, ce qui supprime les doublons) ; prixExcluTeam → prixBonPlan ;
 * - produits des OP : passExcluTeam → passeBonPlan, excluTeamTransferred → bonPlanTransfere,
 *   excluTeamCheaper supprimé (le prix bon plan est désormais conservé à part).
 *
 * Usage (production) :
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/migrate-bon-plan.mjs
 *   (ajouter --dry-run pour simuler sans écrire)
 *
 * Usage (émulateur) :
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/migrate-bon-plan.mjs
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { bonPlanDocId } from '../src/lib/bonPlan.js'
import { parsePrice } from '../src/lib/opImport.js'

const DRY_RUN = process.argv.includes('--dry-run')
const projectId = process.env.GCLOUD_PROJECT || 'sav-workshop'

initializeApp(
  process.env.FIRESTORE_EMULATOR_HOST ? { projectId } : { credential: applicationDefault(), projectId }
)
const db = getFirestore()

// Écritures groupées par 450 (limite Firestore : 500 par batch)
async function commitAll(ops) {
  if (DRY_RUN) return
  for (let i = 0; i < ops.length; i += 450) {
    const batch = db.batch()
    ops.slice(i, i + 450).forEach(op => op(batch))
    await batch.commit()
  }
}

// ── Prix bon plan ────────────────────────────────────────────────────────────
const old = await db.collection('prix_exclu_team').get()
const latest = new Map()
let sansChrono = 0
for (const d of old.docs) {
  const data = d.data()
  const id = bonPlanDocId(data)
  if (!id) { sansChrono++; continue }
  const at = data.importedAt?.toMillis?.() ?? 0
  if (!latest.has(id) || at >= latest.get(id).at) latest.set(id, { at, data })
}
const bonPlanOps = [...latest].map(([id, { data }]) => batch => {
  const { prixExcluTeam, importedAt, ...rest } = data
  batch.set(db.collection('prix_bon_plan').doc(id), {
    ...rest,
    prixFort: parsePrice(rest.prixFort),
    prixBonPlan: parsePrice(prixExcluTeam),
    updatedAt: importedAt || FieldValue.serverTimestamp(),
  })
})
const deleteOps = old.docs.map(d => batch => batch.delete(d.ref))
await commitAll(bonPlanOps)
await commitAll(deleteOps)
console.log(`${DRY_RUN ? '[dry-run] ' : ''}Prix bon plan : ${old.size} document(s) → ${latest.size} chrono(s)` +
  (sansChrono ? ` (${sansChrono} sans chrono ignoré(s))` : ''))

// ── Produits des OP ──────────────────────────────────────────────────────────
const produits = await db.collectionGroup('produits').get()
const produitOps = []
for (const d of produits.docs) {
  const data = d.data()
  if (!('passExcluTeam' in data || 'excluTeamTransferred' in data || 'excluTeamCheaper' in data)) continue
  produitOps.push(batch => batch.update(d.ref, {
    passeBonPlan: !!data.passExcluTeam,
    bonPlanTransfere: !!data.excluTeamTransferred,
    passExcluTeam: FieldValue.delete(),
    excluTeamTransferred: FieldValue.delete(),
    excluTeamCheaper: FieldValue.delete(),
  }))
}
await commitAll(produitOps)
console.log(`${DRY_RUN ? '[dry-run] ' : ''}Produits des OP : ${produitOps.length} mis à jour`)
