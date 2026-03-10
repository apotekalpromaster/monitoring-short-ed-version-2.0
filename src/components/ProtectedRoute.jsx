import useAuthStore from '../store/authStore';
import { Navigate } from 'react-router-dom';

/**
 * Bungkus halaman yang membutuhkan autentikasi.
 * Jika belum login → redirect ke /login.
 * Opsional: `allowedRoles` membatasi akses per role.
 */
function ProtectedRoute({ children, allowedRoles }) {
    const user = useAuthStore((s) => s.user);

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return <Navigate to="/unauthorized" replace />;
    }

    return children;
}

export default ProtectedRoute;
