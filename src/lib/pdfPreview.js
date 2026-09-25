// Aperçu d'un PDF en image (pdf.js, chargé à la demande) : fonctionne aussi sur téléphone,
// où les navigateurs n'affichent pas les PDF dans la page.
let pdfjsPromise = null

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })
  }
  return pdfjsPromise
}

// Dessine la première page de `bytes` dans `canvas`, à la largeur donnée (pixels CSS)
export async function renderPdfPreview(bytes, canvas, cssWidth) {
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({ data: bytes.slice() })
  const pdf = await task.promise
  try {
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const ratio = window.devicePixelRatio || 1
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * ratio })
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise
  } finally {
    task.destroy()
  }
}
