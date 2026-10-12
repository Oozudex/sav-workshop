// Photo prise avec le téléphone → JPEG réduit (2000 px au plus grand côté) en base64 : envoi rapide,
// même en 4G, et assez net pour lire une étiquette.
function chargerImage(file) {
  // createImageBitmap tient compte de l'orientation de la photo ; repli sur <img> si le format ne passe pas
  return createImageBitmap(file).catch(() => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('photo illisible')) }
    img.src = url
  }))
}

export async function photoEnBase64(file, max = 2000) {
  const image = await chargerImage(file)
  const scale = Math.min(1, max / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * scale)
  canvas.height = Math.round(image.height * scale)
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
  image.close?.()
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
}
