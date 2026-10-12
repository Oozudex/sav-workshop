import { initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const useEmulator = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === 'true'

// App Check : seules les pages du vrai site obtiennent un jeton (reCAPTCHA Enterprise, invisible) ;
// une fois l'obligation activée, la base et les fonctions refusent les appels sans jeton (scripts,
// copies du site). Pas en émulateur ; sans clé configurée, l'appli fonctionne sans App Check.
const recaptchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
if (recaptchaKey && !useEmulator) {
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(recaptchaKey), isTokenAutoRefreshEnabled: true })
}
export const auth = getAuth(app)
// E-mails envoyés par Firebase (définition / réinitialisation du mot de passe) en français
auth.languageCode = 'fr'
export const db = getFirestore(app)
// Cloud Functions (dossier functions/, région europe-west1)
export const functions = getFunctions(app, 'europe-west1')

if (useEmulator) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, 'localhost', 8080)
  connectFunctionsEmulator(functions, 'localhost', 5001)
}
