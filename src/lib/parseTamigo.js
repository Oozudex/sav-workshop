import * as XLSX from 'xlsx'

// Codes d'absence reconnus → label affiché
export const ABSENCE_LABELS = {
  CP:  'Congé payé',
  JFF: 'Jour férié',
  HEB: 'Repos hebdo',
  AT:  'Accident travail',
  MAL: 'Maladie',
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function extractCellContent(cellValue) {
  const text = String(cellValue ?? '').trim()
  if (!text) return { shifts: [], absenceCode: null }

  // Extraire les créneaux horaires
  const shifts = []
  const regex = /(\d{1,2}[h:]\d{2})\s*[-–]\s*(\d{1,2}[h:]\d{2})\s*([^\n\d\-–]*)/g
  let m
  while ((m = regex.exec(text)) !== null) {
    const normalize = t => t.replace('h', ':').padStart(5, '0')
    const code = m[3].trim().replace(/[^a-zA-ZÀ-ÿ]/g, '').trim() || null
    shifts.push({ startTime: normalize(m[1]), endTime: normalize(m[2]), activityCode: code })
  }

  // Détecter un code d'absence en l'absence de créneau horaire
  let absenceCode = null
  if (shifts.length === 0) {
    const lines = text.split(/[\n\r]+/)
    for (const line of lines) {
      const clean = line.trim().toUpperCase()
      if (clean in ABSENCE_LABELS) { absenceCode = clean; break }
    }
  }

  return { shifts, absenceCode }
}

export function parseTamigoExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Erreur lecture fichier'))
    reader.onload = e => {
      try {
        const wb   = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        // Trouver la ligne d'en-tête avec les noms de jours
        let hdrIdx = -1
        for (let i = 0; i < Math.min(rows.length, 6); i++) {
          if (rows[i].some(c => /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i.test(String(c)))) {
            hdrIdx = i; break
          }
        }
        if (hdrIdx === -1) {
          reject(new Error('Format non reconnu : colonnes de jours introuvables')); return
        }

        // Extraire les colonnes de jours avec leurs dates
        const hdr = rows[hdrIdx]
        const now = new Date(), yr = now.getFullYear()
        const dayCols = []
        for (let col = 1; col < hdr.length; col++) {
          const match = String(hdr[col] || '').match(/(\d{1,2})[\/\.](\d{1,2})/)
          if (!match) continue
          let year = yr
          if (+match[2] === 1 && now.getMonth() === 11) year = yr + 1
          if (+match[2] === 12 && now.getMonth() === 0) year = yr - 1
          dayCols.push({ col, dateStr: toDateStr(new Date(year, +match[2] - 1, +match[1])) })
        }
        if (dayCols.length === 0) {
          reject(new Error('Aucune date trouvée dans les en-têtes')); return
        }

        // Titre du fichier (première ligne)
        const title = String(rows[0]?.[0] || rows[0]?.find(Boolean) || '').trim()

        // Extraire créneaux et absences employé par employé
        const shifts   = []
        const absences = []
        let employee = null
        for (let ri = hdrIdx + 1; ri < rows.length; ri++) {
          const row  = rows[ri]
          const name = String(row[0] || '').trim()
          if (name) employee = name
          if (!employee) continue

          for (const { col, dateStr } of dayCols) {
            const { shifts: slots, absenceCode } = extractCellContent(row[col])
            for (const slot of slots) {
              shifts.push({ employeeName: employee, date: dateStr, ...slot })
            }
            if (absenceCode) {
              absences.push({ employeeName: employee, date: dateStr, absenceCode })
            }
          }
        }

        resolve({ shifts, absences, title, dates: dayCols.map(d => d.dateStr) })
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}
