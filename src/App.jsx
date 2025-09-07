import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './store/useAuth'
import { useTheme } from './store/useTheme'
import Login from './pages/Login'
import Tickets from './pages/Tickets'
import Profile from './pages/Profile'
import AdminUsers from './pages/AdminUsers'
import Orders from './pages/Orders'
import Requests from './pages/Requests'

function PrivateRoute({ children }) {
  const { user, loading, profile } = useAuth(s => ({ user: s.user, loading: s.loading, profile: s.profile }))
  // si tu as un indicateur dédié type s.profileLoading, utilise-le.
  const profileLoading = !!user && profile === undefined // profil pas encore fetché
  const location = useLocation()
  if (loading || profileLoading) return <div className="p-6">Chargement…</div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function RoleRoute({ children, roles }) {
  const { user, loading, profile } = useAuth(s => ({ user: s.user, loading: s.loading, profile: s.profile }))
  const location = useLocation()
  if (loading) return <div className="p-6">Chargement…</div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (!roles.includes(profile?.role)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const initAuth = useAuth(s => s.init)
  const initTheme = useTheme(s => s.init)
  useEffect(() => { initAuth(); initTheme() }, [initAuth, initTheme])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Tickets /></PrivateRoute>} />
      <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
      <Route
        path="/admin"
        element={
          <RoleRoute roles={['admin', 'buyer']}>
            <AdminUsers />
          </RoleRoute>
        }
      />
      <Route path="/orders" element={<PrivateRoute><Orders /></PrivateRoute>} />
      <Route path="/requests" element={<PrivateRoute><Requests /></PrivateRoute>} />
    </Routes>
  )
}
