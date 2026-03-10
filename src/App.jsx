import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import LoginPage from './pages/LoginPage';
import MainLayout from './components/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';

// Dashboard shells
import DashboardOutlet from './pages/DashboardOutlet';
import DashboardAM from './pages/DashboardAM';
import DashboardProcurement from './pages/DashboardProcurement';
import DashboardBOD from './pages/DashboardBOD';

// Outlet sub-pages (stub shells, filled in Phase 4)
import OutletScanPage from './pages/OutletScanPage';
import OutletInputPage from './pages/OutletInputPage';
import OutletMonitoringPage from './pages/OutletMonitoringPage';

function AppRoutes() {
  const user = useAuthStore((s) => s.user);

  const rootRedirect = () => {
    if (!user) return <Navigate to="/login" replace />;
    if (user.role === 'OUTLET') return <Navigate to="/outlet/scan" replace />;
    if (user.role === 'AM') return <Navigate to="/am" replace />;
    if (user.role === 'PROCUREMENT') return <Navigate to="/procurement" replace />;
    if (user.role === 'BOD') return <Navigate to="/procurement" replace />;
    return <Navigate to="/login" replace />;
  };

  return (
    <Routes>
      <Route path="/" element={rootRedirect()} />
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

      {/* ── OUTLET routes ── */}
      <Route
        element={
          <ProtectedRoute allowedRoles={['OUTLET']}>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        {/* Default redirect for /outlet → /outlet/scan */}
        <Route index path="/outlet" element={<Navigate to="/outlet/scan" replace />} />
        <Route path="/outlet/scan" element={<OutletScanPage />} />
        <Route path="/outlet/input" element={<OutletInputPage />} />
        <Route path="/outlet/monitoring" element={<OutletMonitoringPage />} />
      </Route>

      {/* ── AM routes ── */}
      <Route
        element={
          <ProtectedRoute allowedRoles={['AM']}>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/am" element={<DashboardAM />} />
      </Route>

      {/* ── PROCUREMENT routes (accessible by PROCUREMENT + BOD) ── */}
      <Route
        element={
          <ProtectedRoute allowedRoles={['PROCUREMENT', 'BOD']}>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/procurement" element={<DashboardProcurement />} />
        <Route path="/bod" element={<DashboardBOD />} />
      </Route>

      <Route path="/unauthorized" element={<div style={{ padding: '40px', textAlign: 'center' }}>Akses Ditolak.</div>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
