import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './store/useAuth'
import { useTheme } from './store/useTheme'
import Login from './pages/Login'
import Home from './pages/Home'
import B2B from './pages/B2B'
import RH from './pages/RH'
import Service from './pages/Service'
import Tickets from './pages/Tickets'
import Profile from './pages/Profile'
import Orders from './pages/Orders'
import Requests from './pages/Requests'
import StoreSettings from './pages/StoreSettings'
import Operations from './pages/Operations'
import OperationDetail from './pages/OperationDetail'
import Flocage from './pages/Flocage'
import Transfert from './pages/Transfert'
import Obut from './pages/Obut'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth(s => ({ user: s.user, loading: s.loading }))
  const location = useLocation()
  if (loading) return <div className="p-6">Chargement…</div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function RoleRoute({ children, roles, acheteurRayons }) {
  const { user, loading, profile } = useAuth(s => ({ user: s.user, loading: s.loading, profile: s.profile }))
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
      <Route path="/requests" element={<PrivateRoute><Requests /></PrivateRoute>} />
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
  )
}
