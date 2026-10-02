// Toute la todo list est faite : grand écran « Tié un tigre », comme l'easter egg de la page SAV.
import { useEffect, useState } from 'react'
import Portal from '../Portal'
import { confetti } from '../../lib/celebrate'

const EMOJIS = ['🐯', '🐅', '🔥', '💪', '🏆', '⭐', '🎉', '🐯']

export default function TigerScreen({ onClose }) {
  // Positions tirées une fois (pas à chaque rendu)
  const flottants = useState(() => Array.from({ length: 40 }, (_, i) => ({
    id: i,
    emoji: EMOJIS[i % EMOJIS.length],
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 3}s`,
    duration: `${3 + Math.random() * 3}s`,
    size: `${1.4 + Math.random() * 2.8}rem`,
  })))[0]

  useEffect(() => {
    // Salves de confettis pendant que l'écran est ouvert
    const tirs = [0, 700, 1400, 2400, 3600].map(t => setTimeout(() => confetti({
      x: window.innerWidth * (0.2 + Math.random() * 0.6), y: window.innerHeight * 0.75,
    }), t))
    const fn = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', fn)
    return () => { tirs.forEach(clearTimeout); window.removeEventListener('keydown', fn) }
  }, [onClose])

  return (
    <Portal>
      <div onClick={onClose} role="dialog" aria-modal="true" aria-label="Toute la liste est faite"
        className="fixed inset-0 z-[999] flex flex-col items-center justify-center cursor-pointer overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 45%, #b91c1c 100%)' }}>
        {/* Rayures de tigre qui défilent */}
        <div aria-hidden className="tigre-rayures absolute inset-0 opacity-20"
          style={{ backgroundImage: 'repeating-linear-gradient(115deg, transparent 0 46px, #111 46px 64px, transparent 64px 120px)' }} />

        {flottants.map(f => (
          <span key={f.id} aria-hidden className="tigre-monte absolute select-none pointer-events-none"
            style={{ left: f.left, bottom: '-3rem', fontSize: f.size, animationDuration: f.duration, animationDelay: f.delay }}>
            {f.emoji}
          </span>
        ))}

        <div className="relative z-10 text-center px-8 select-none">
          <p className="tigre-pop text-white/90 text-base sm:text-lg font-bold mb-3 tracking-widest uppercase">Toute la liste est faite 🎉</p>
          <h1 className="tigre-titre text-white font-black tracking-tight"
            style={{ fontSize: 'clamp(3rem, 11vw, 8rem)', textShadow: '0 6px 0 rgba(0,0,0,.25), 0 10px 40px rgba(0,0,0,.35)' }}>
            Tié un tigre 🐯
          </h1>
          <p className="text-white/70 text-sm mt-8 font-medium">Clique n’importe où pour fermer</p>
        </div>

        <style>{`
          .tigre-monte { animation-name: tigre-monte; animation-timing-function: ease-in; animation-iteration-count: infinite; }
          @keyframes tigre-monte {
            0%   { transform: translateY(0) rotate(-15deg) scale(.8); opacity: 0; }
            10%  { opacity: 1; }
            90%  { opacity: .9; }
            100% { transform: translateY(-115vh) rotate(15deg) scale(1.15); opacity: 0; }
          }
          .tigre-titre { animation: tigre-titre 1.2s cubic-bezier(.2,1.6,.4,1) both, tigre-pulse 1.6s ease-in-out 1.2s infinite; }
          @keyframes tigre-titre { from { transform: scale(.2) rotate(-12deg); opacity: 0; } to { transform: none; opacity: 1; } }
          @keyframes tigre-pulse { 0%, 100% { transform: scale(1) rotate(0); } 25% { transform: scale(1.05) rotate(-2deg); } 75% { transform: scale(1.05) rotate(2deg); } }
          .tigre-pop { animation: tigre-titre .8s ease-out .3s both; }
          .tigre-rayures { animation: tigre-rayures 6s linear infinite; background-size: 240px 240px; }
          @keyframes tigre-rayures { from { background-position: 0 0; } to { background-position: 240px 0; } }
          @media (prefers-reduced-motion: reduce) {
            .tigre-monte, .tigre-titre, .tigre-pop, .tigre-rayures { animation: none; }
          }
        `}</style>
      </div>
    </Portal>
  )
}
