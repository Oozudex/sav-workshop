// Récapitulatif imprimable remis au client : commande client (vélo, pièce, accessoire) ou commande OBUT.
// Données affichées sur le document. Fonctions pures : tests/unit/recapCommande.test.mjs ; dessin : recapPdf.js
import { ORDER_TYPES, formatOrderNumber, isOrderSav, orderQuantity, orderTotal, parseEuro, remainingToPay } from './orders.js'
import { obutClientName, obutLines, obutRemaining, obutTotal } from './obut.js'
import { toDate } from './ticketStats.js'

const texte = v => String(v ?? '').trim()
const dateFr = d => (d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '')
const ymdFr = ymd => {
  const [y, m, d] = String(ymd || '').split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

/**
 * Commande client → { kind: 'client', sav, magasin, numero, date, client, tel, vendeur, lignes, total, acompte, reste }
 * Commande SAV : aucun montant (sav: true, prix des lignes à null).
 */
export function recapClient(order, magasin) {
  const sav = isOrderSav(order)
  const detail = [order.type && ORDER_TYPES[order.type], texte(order.fournisseur) && `fournisseur ${texte(order.fournisseur)}`]
    .filter(Boolean).join(' · ')
  const lignes = [{
    label: texte(order.produit) || 'Article commandé', detail: detail || null,
    ref: texte(order.ref_produit) || null, qte: orderQuantity(order), prix: sav ? null : parseEuro(order.prix),
  }]
  const port = sav ? null : parseEuro(order.fraisPort)
  if (port) lignes.push({ label: 'Frais de port', ref: null, qte: null, prix: port })
  return {
    kind: 'client',
    sav,
    magasin: texte(magasin),
    numero: order.numero ? formatOrderNumber(order.numero) : '',
    date: dateFr(toDate(order.createdAt)),
    client: texte(order.client), tel: texte(order.tel), vendeur: texte(order.createur),
    lignes,
    total: sav ? null : orderTotal(order), acompte: sav ? 0 : parseEuro(order.acompte) || 0, reste: sav ? null : remainingToPay(order),
  }
}

/** Commande OBUT → mêmes champs, plus les caractéristiques des boules et la gravure */
export function recapObut(cmd, magasin) {
  const lignes = obutLines(cmd).map(l => ({ label: l.label, detail: l.detail ? `« ${l.detail} »` : null, prix: l.prix }))
  return {
    kind: 'obut',
    sav: false,
    magasin: texte(magasin),
    numero: '',
    date: ymdFr(cmd.dateCommande) || dateFr(toDate(cmd.createdAt)),
    client: obutClientName(cmd), tel: texte(cmd.clientTel), vendeur: texte(cmd.vendeur),
    modele: texte(cmd.modele),
    diametre: texte(cmd.diametre), poids: texte(cmd.poids), stries: texte(cmd.strie),
    marquageLabel: cmd.marquage ? texte(cmd.marquageLabel) || 'Marquage' : '',
    marquage: texte(cmd.marquage),
    lignes,
    total: cmd.totalTTC ?? obutTotal(cmd), acompte: parseEuro(cmd.acompte) || 0, reste: cmd.resteARegler ?? obutRemaining(cmd),
  }
}

// Nom du fichier PDF : « Récapitulatif C-2026-0142 Dupont.pdf »
export function nomFichierRecap(recap) {
  const qui = recap.client.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  return `Récapitulatif ${[recap.kind === 'obut' ? 'OBUT' : recap.numero.replace('#', ''), qui].filter(Boolean).join(' ')}.pdf`
}
