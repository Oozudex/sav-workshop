// Petites fêtes quand une tâche est finie : confettis, ou pluie de promos pour la fin d'une OP.
// Dessin sur un canvas posé au-dessus de la page, retiré à la fin. Rien si l'utilisateur a demandé
// moins d'animations dans son système.

const COULEURS = ['#E30613', '#164194', '#FFC400', '#00A86B', '#FF6F91', '#7B61FF', '#FFFFFF']
const PROMOS = ['PROMO', '-30 %', '-50 %', '%', 'SOLDES', 'BON PLAN', '🏷️', '🔥', '-20 %', '💸']

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function overlay() {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999'
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  return { canvas, ctx, w: window.innerWidth, h: window.innerHeight }
}

function animate(particles, draw, duree) {
  const { canvas, ctx, w, h } = overlay()
  const start = performance.now()
  let last = start
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    ctx.clearRect(0, 0, w, h)
    const fade = Math.max(0, Math.min(1, (start + duree - now) / 600))
    for (const p of particles) {
      p.vy += p.g * dt
      p.vx *= 0.995
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vr * dt
      ctx.save()
      ctx.globalAlpha = fade
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      draw(ctx, p)
      ctx.restore()
    }
    if (now - start < duree) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}

const rand = (a, b) => a + Math.random() * (b - a)

/** Confettis tirés depuis un point (par défaut le centre bas de l'écran). */
export function confetti(origin) {
  if (reducedMotion() || typeof document === 'undefined') return
  const w = window.innerWidth, h = window.innerHeight
  const x0 = origin?.x ?? w / 2, y0 = origin?.y ?? h * 0.7
  const particles = Array.from({ length: 160 }, () => {
    const angle = rand(-Math.PI * 0.9, -Math.PI * 0.1)
    const speed = rand(350, 900)
    return {
      x: x0, y: y0, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, g: 900,
      rot: rand(0, Math.PI), vr: rand(-12, 12), size: rand(6, 11), color: COULEURS[Math.floor(Math.random() * COULEURS.length)],
      rond: Math.random() < 0.3,
    }
  })
  animate(particles, (ctx, p) => {
    ctx.fillStyle = p.color
    if (p.rond) { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill() }
    else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
  }, 2600)
}

/** Pluie de promos sur tout l'écran (fin d'une OP). */
export function promoRain() {
  if (reducedMotion() || typeof document === 'undefined') return
  const w = window.innerWidth
  const particles = Array.from({ length: 70 }, () => ({
    x: rand(0, w), y: rand(-window.innerHeight, -20), vx: rand(-40, 40), vy: rand(150, 380), g: 220,
    rot: rand(-0.4, 0.4), vr: rand(-1.5, 1.5), size: rand(16, 34),
    texte: PROMOS[Math.floor(Math.random() * PROMOS.length)],
    color: Math.random() < 0.6 ? '#E30613' : Math.random() < 0.5 ? '#164194' : '#FFC400',
  }))
  animate(particles, (ctx, p) => {
    ctx.font = `900 ${p.size}px "Plus Jakarta Sans", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (/[A-Z%0-9]/.test(p.texte)) {
      ctx.lineWidth = Math.max(3, p.size / 6)
      ctx.strokeStyle = '#FFFFFF'
      ctx.strokeText(p.texte, 0, 0)
    }
    ctx.fillStyle = p.color
    ctx.fillText(p.texte, 0, 0)
  }, 4200)
  // Et des confettis par-dessus
  setTimeout(() => confetti({ x: window.innerWidth / 2, y: window.innerHeight * 0.6 }), 300)
}

/** Des vélos qui traversent l'écran dans tous les sens (relance atelier faite). */
export function bikeRain() {
  if (reducedMotion() || typeof document === 'undefined') return
  const w = window.innerWidth, h = window.innerHeight
  const particles = Array.from({ length: 34 }, (_, i) => {
    const versDroite = i % 2 === 0
    return {
      x: versDroite ? rand(-260, -40) : rand(w + 40, w + 260), y: rand(h * 0.05, h * 0.95),
      vx: (versDroite ? 1 : -1) * rand(380, 820), vy: rand(-120, 60), g: rand(-20, 80),
      rot: rand(-0.25, 0.25), vr: rand(-0.6, 0.6), size: rand(26, 58), flip: !versDroite,
      emoji: Math.random() < 0.7 ? '🚲' : '🚴',
    }
  })
  animate(particles, (ctx, p) => {
    if (p.flip) ctx.scale(-1, 1) // les vélos regardent dans le sens où ils roulent
    ctx.font = `${p.size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(p.emoji, 0, 0)
  }, 3800)
}
