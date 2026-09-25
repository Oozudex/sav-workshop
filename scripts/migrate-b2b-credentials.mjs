#!/usr/bin/env node
/**
 * Migration unique : déplace les identifiants B2B du champ `credentials`
 * de b2b_tools/{id} vers la sous-collection b2b_tools/{id}/credentials/{magasinId}.
 *
 * Avant : n'importe quel compte connecté pouvait lire les mots de passe de tous les magasins.
 * Après : chaque magasin ne lit que ses propres identifiants (cf. firestore.rules).
 *
 * Usage (production) :
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/migrate-b2b-credentials.mjs
 *   (ajouter --dry-run pour simuler sans écrire)
 *
 * Usage (émulateur) :
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=sav-workshop node scripts/migrate-b2b-credentials.mjs
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const DRY_RUN = process.argv.includes('--dry-run')
const projectId = process.env.GCLOUD_PROJECT || 'groupe-nivault'

initializeApp(
  process.env.FIRESTORE_EMULATOR_HOST ? { projectId } : { credential: applicationDefault(), projectId }
)
const db = getFirestore()

const tools = await db.collection('b2b_tools').get()
let migrated = 0

for (const toolDoc of tools.docs) {
  const credentials = toolDoc.get('credentials')
  if (!credentials || typeof credentials !== 'object') continue

  const batch = db.batch()
  const storeIds = []
  for (const [magasinId, value] of Object.entries(credentials)) {
    if (!value?.email && !value?.password) continue
    storeIds.push(magasinId)
    batch.set(toolDoc.ref.collection('credentials').doc(magasinId), {
      email: value.email || '',
      password: value.password || '',
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
  batch.update(toolDoc.ref, {
    credentials: FieldValue.delete(),
    credentialStoreIds: storeIds,
  })

  console.log(`${DRY_RUN ? '[dry-run] ' : ''}${toolDoc.get('label') || toolDoc.id} : ${storeIds.length} magasin(s)`)
  if (!DRY_RUN) await batch.commit()
  migrated++
}

console.log(`\n${migrated} outil(s) B2B ${DRY_RUN ? 'à migrer' : 'migré(s)'}.`)
