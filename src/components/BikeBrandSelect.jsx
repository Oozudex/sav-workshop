// Marque du vélo : liste des marques vendues, ou « Autre marque » avec saisie libre
import { useState } from 'react'
import { BIKE_BRANDS } from '../lib/constants'

const OTHER = '__autre__'
const known = v => BIKE_BRANDS.find(b => b.toLowerCase() === String(v || '').trim().toLowerCase())

export default function BikeBrandSelect({ value, onChange }) {
  // Marque hors liste déjà saisie (ancien ticket) : on reste en saisie libre
  const [other, setOther] = useState(() => !!String(value || '').trim() && !known(value))

  return (
    <div className="space-y-2">
      <select className="Input" value={other ? OTHER : known(value) || ''}
        onChange={e => {
          const v = e.target.value
          setOther(v === OTHER)
          onChange(v === OTHER ? '' : v)
        }}>
        <option value="">— Choisir</option>
        {BIKE_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
        <option value={OTHER}>Autre marque</option>
      </select>
      {other && (
        <input className="Input" value={value || ''} onChange={e => onChange(e.target.value)}
          placeholder="Nom de la marque" aria-label="Autre marque" autoFocus />
      )}
    </div>
  )
}
