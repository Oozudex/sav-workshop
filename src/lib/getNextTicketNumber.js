import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'

export async function getNextTicketNumber() {
    const ref = doc(db, 'counters', 'tickets')

    const { next, year } = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        const y = new Date().getFullYear()

        if (!snap.exists()) {
            tx.set(ref, { lastNumber: 0, year: y, updatedAt: serverTimestamp() })
            return { next: 1, year: y }
        }

        let { lastNumber = 0, year = y } = snap.data()
        if (year !== y) { lastNumber = 0; year = y }
        const n = lastNumber + 1

        tx.update(ref, { lastNumber: n, year, updatedAt: serverTimestamp() })
        return { next: n, year }
    })

    const padded = String(next).padStart(4, '0')
    return `SAV-${year}-${padded}`
}
