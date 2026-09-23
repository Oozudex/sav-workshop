import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './store/useAuth'
import { useShallow } from 'zustand/react/shallow'
import { useTheme } from './store/useTheme'
import Login from './pages/Login'
import AlertsWatcher from './components/AlertsWatcher'

// Pages chargées à la demande : chaque route devient un fichier JS séparé
const Home            = lazy(() => import('./pages/Home'))
const B2B             = lazy(() => import('./pages/B2B'))
const RH              = lazy(() => import('./pages/RH'))
const Service         = lazy(() => import('./pages/Service'))
const Tickets         = lazy(() => import('./pages/Tickets'))
const Profile         = lazy(() => import('./pages/Profile'))
const Orders          = lazy(() => import('./pages/Orders'))
const StoreSettings   = lazy(() => import('./pages/StoreSettings'))
const Operations      = lazy(() => import('./pages/Operations'))
const OperationDetail = lazy(() => import('./pages/OperationDetail'))
const Flocage         = lazy(() => import('./pages/Flocage'))
const Transfert       = lazy(() => import('./pages/Transfert'))
const Obut            = lazy(() => import('./pages/Obut'))

function PrivateRoute({ children }) {
  const { user, loading } = useAuth(useShallow(s => ({ user: s.user, loading: s.loading })))
  const location = useLocation()
  if (loading) return <div className="p-6">Chargement…</div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function RoleRoute({ children, roles, acheteurRayons }) {
  const { user, loading, profile } = useAuth(useShallow(s => ({ user: s.user, loading: s.loading, profile: s.profile })))
  const location = useLocation()
  if (loading) return <div className="p-6">Chargement…</div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (!roles.includes(profile?.role)) return <Navigate to="/" replace />
  if (profile?.role === 'acheteur' && acheteurRayons) {
    const profileRayons = profile?.rayons || []
    if (!acheteurRayons.some(r => profileRayons.includes(r))) return <Navigate to="/" replace />
  }
  return children
}

export default function App() {
  const initAuth = useAuth(s => s.init)
  const initTheme = useTheme(s => s.init)
  useEffect(() => {
    const unsub = initAuth()
    initTheme()
    return unsub
  }, [initAuth, initTheme])

  return (
    <>
      <AlertsWatcher />
      <Suspense fallback={<div className="p-6">Chargement…</div>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Home /></PrivateRoute>} />
          <Route path="/tickets" element={<PrivateRoute><Tickets /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
          <Route
            path="/settings"
            element={
              <RoleRoute roles={['directeurmag', 'acheteur', 'directeurgen']}>
                <StoreSettings />
              </RoleRoute>
            }
          />
          <Route path="/b2b" element={<PrivateRoute><B2B /></PrivateRoute>} />
          <Route path="/rh" element={<PrivateRoute><RH /></PrivateRoute>} />
          <Route path="/service" element={<PrivateRoute><Service /></PrivateRoute>} />
          <Route path="/orders" element={<PrivateRoute><Orders /></PrivateRoute>} />
          <Route path="/operations" element={<PrivateRoute><Operations /></PrivateRoute>} />
          <Route path="/operations/:id" element={<PrivateRoute><OperationDetail /></PrivateRoute>} />
          <Route
            path="/flocage"
            element={
              <RoleRoute roles={['chaussure', 'directeurmag', 'acheteur', 'directeurgen']} acheteurRayons={['chaussure']}>
                <Flocage />
              </RoleRoute>
            }
          />
          <Route
            path="/transfert"
            element={
              <RoleRoute roles={['velo', 'directeurmag', 'acheteur', 'directeurgen']} acheteurRayons={['velo']}>
                <Transfert />
              </RoleRoute>
            }
          />
          <Route
            path="/obut"
            element={
              <RoleRoute roles={['velo', 'directeurmag', 'acheteur', 'directeurgen']} acheteurRayons={['velo']}>
                <Obut />
              </RoleRoute>
            }
          />
        </Routes>
      </Suspense>
    </>
  )
}
