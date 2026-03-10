import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Auth Store — menyimpan sesi pengguna saat ini.
 * user shape: { name, role, code, am? }
 * Roles: 'OUTLET' | 'AM' | 'BOD' | 'PROCUREMENT'
 */
const useAuthStore = create(
    persist(
        (set) => ({
            user: null,
            setUser: (user) => set({ user }),
            logout: () => set({ user: null }),
        }),
        {
            name: 'alpro-short-ed-auth',
        }
    )
);

export default useAuthStore;
