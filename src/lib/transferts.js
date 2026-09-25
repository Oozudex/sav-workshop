// Transferts de vélos entre magasins : qui envoie, qui reçoit, qui doit agir.
// Fonctions pures : testées dans tests/unit/transferts.test.mjs
//
// Les documents gardent fromMagasinId / toMagasinId (règles Firestore), mais leur sens dépend
// de qui a créé la demande :
//   - demande d'un vendeur : from = magasin qui DEMANDE le vélo (il le reçoit), to = magasin qui l'a (il l'envoie)
//   - transfert de l'acheteur : from = magasin qui ENVOIE, to = magasin qui reçoit
// Tout l'affichage passe par transferSides() pour ne parler que d'« envoie » et de « reçoit ».

export const TRANSFER_ACTIVE_STATUSES = ['pending', 'accepted', 'shipped', 'refused']

export const TRANSFER_STATUS = {
  pending:   { label: 'En attente de réponse', dot: 'bg-amber-400',
    pill: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/20' },
  accepted:  { label: 'Accepté · à envoyer', dot: 'bg-blue-500',
    pill: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20' },
  shipped:   { label: 'En route', dot: 'bg-violet-500',
    pill: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20' },
  completed: { label: 'Reçu', dot: 'bg-emerald-500',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20' },
  refused:   { label: 'Refusé', dot: 'bg-red-500',
    pill: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20' },
}

// Les 4 étapes d'un transfert (l'explication en haut de page et la frise de chaque carte)
export const TRANSFER_STEPS = [
  { key: 'demande', label: 'Demande', help: 'Le magasin qui a besoin du vélo (ou l’acheteur) fait la demande.' },
  { key: 'reponse', label: 'Réponse', help: 'Le magasin qui a le vélo accepte ou refuse.' },
  { key: 'envoi', label: 'Envoi', help: 'Il protège le vélo, l’envoie et le marque « envoyé ».' },
  { key: 'reception', label: 'Réception', help: 'Le magasin qui reçoit confirme l’arrivée : c’est terminé.' },
]

export function transferStatus(t) {
  return TRANSFER_STATUS[t?.status] ? t.status : 'pending'
}

// Nombre d'étapes franchies (0 à 4) pour la frise
export function transferProgress(t) {
  return { pending: 1, refused: 2, accepted: 2, shipped: 3, completed: 4 }[transferStatus(t)]
}

export function transferSides(t) {
  const byAcheteur = !!t.createdByAcheteur
  return byAcheteur
    ? { senderId: t.fromMagasinId, senderNom: t.fromMagasinNom, receiverId: t.toMagasinId, receiverNom: t.toMagasinNom, byAcheteur }
    : { senderId: t.toMagasinId, senderNom: t.toMagasinNom, receiverId: t.fromMagasinId, receiverNom: t.fromMagasinNom, byAcheteur }
}

// 'sender' | 'receiver' | null
export function myTransferRole(t, magasinId) {
  if (!magasinId) return null
  const s = transferSides(t)
  if (s.senderId === magasinId) return 'sender'
  if (s.receiverId === magasinId) return 'receiver'
  return null
}

// Champ « non lu » du magasin (readByFrom / readByTo suivent from / to)
export function readField(t, magasinId) {
  if (t.fromMagasinId === magasinId) return 'readByFrom'
  if (t.toMagasinId === magasinId) return 'readByTo'
  return null
}
export function otherReadField(t, magasinId) {
  const mine = readField(t, magasinId)
  return mine === 'readByFrom' ? 'readByTo' : mine === 'readByTo' ? 'readByFrom' : null
}

// Prochaine étape, du point de vue d'un magasin (ou de l'acheteur / de la direction)
// → { mine: l'action revient à ce magasin, text, action? }
//   action : 'respond' | 'ship' | 'receive' | 'close'
export function transferNextStep(t, { magasinId = null, canAct = false, isAcheteur = false } = {}) {
  const status = transferStatus(t)
  const s = transferSides(t)
  const role = myTransferRole(t, magasinId)
  const act = (action, text) => ({ mine: true, action, text })
  const wait = text => ({ mine: false, text })

  if (status === 'pending') {
    if (role === 'sender' && canAct) return act('respond', 'À vous : avez-vous ce vélo ? Acceptez ou refusez la demande.')
    return wait(`En attente de la réponse de ${s.senderNom || 'l’autre magasin'}.`)
  }
  if (status === 'accepted') {
    if (role === 'sender' && canAct) return act('ship', `À vous : protégez le vélo, envoyez-le à ${s.receiverNom}, puis marquez-le envoyé.`)
    if (role === 'receiver' && canAct) return { ...act('receive', `${s.senderNom} prépare l’envoi. Confirmez la réception quand le vélo arrive.`), mine: false }
    return wait(`${s.senderNom} doit envoyer le vélo à ${s.receiverNom}.`)
  }
  if (status === 'shipped') {
    if (role === 'receiver' && canAct) return act('receive', 'À vous : le vélo est en route. Confirmez sa réception dès qu’il arrive.')
    return wait(`Vélo en route vers ${s.receiverNom}.`)
  }
  if (status === 'refused') {
    // La demande refusée est classée par celui qui l'a faite
    const requester = s.byAcheteur ? isAcheteur : role === 'receiver' && canAct
    if (requester) return act('close', `Refusé par ${s.senderNom}. Classez la demande (ou demandez à un autre magasin).`)
    if (role === 'sender') return wait(`Vous avez refusé. ${s.byAcheteur ? 'L’acheteur' : s.receiverNom} classera la demande.`)
    return wait(s.byAcheteur ? `Refusé par ${s.senderNom}. L’acheteur classera la demande.` : `Refusé par ${s.senderNom}.`)
  }
  return wait(`Vélo reçu par ${s.receiverNom}.`)
}

// Le magasin doit faire quelque chose (pastilles des onglets et de l'accueil)
export function transferNeedsAction(t, magasinId, opts = {}) {
  return transferNextStep(t, { magasinId, canAct: true, ...opts }).mine
}
