import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import useAuthStore from '../store/authStore';
import styles from './LoginPage.module.css';

/**
 * Logika Auth (ditranslasikan dari Auth.gs):
 *
 * Step 1: BOD check (hardcoded via env)
 * Step 2: Procurement check (hardcoded via env)
 * Step 3: Outlet check — query master_outlets, login TANPA password
 * Step 4: AM check — query master_am dengan username + password
 */
async function doLogin(username, password) {
    const user = username.trim().toUpperCase();
    const pass = password.trim().toUpperCase();

    if (!user) return { success: false, message: 'Nama pengguna tidak boleh kosong.' };

    // Step 1: BOD
    if (user === import.meta.env.VITE_BOD_USERNAME) {
        if (pass === import.meta.env.VITE_BOD_PASSWORD) {
            return { success: true, user: { name: import.meta.env.VITE_BOD_NAME, role: 'BOD', code: 'BOD' } };
        }
        return { success: false, message: 'Password BOD salah.' };
    }

    // Step 2: Procurement
    if (user === import.meta.env.VITE_PROCUREMENT_USERNAME) {
        if (pass === import.meta.env.VITE_PROCUREMENT_PASSWORD) {
            return { success: true, user: { name: import.meta.env.VITE_PROCUREMENT_NAME, role: 'PROCUREMENT', code: 'PROC' } };
        }
        return { success: false, message: 'Password Procurement salah.' };
    }

    // Step 3: Outlet (tanpa password)
    const { data: outletData, error: outletErr } = await supabase
        .from('master_outlets')
        .select('*')
        .eq('outlet_name', user)
        .limit(1);

    if (outletErr) throw new Error(outletErr.message);

    if (outletData && outletData.length > 0) {
        const o = outletData[0];
        return {
            success: true,
            user: { name: o.outlet_name, role: 'OUTLET', code: o.outlet_code, am: o.am_name },
        };
    }

    // Step 4: AM (dengan password)
    if (!pass) return { success: false, message: 'Masukkan password untuk akun ini.' };

    const { data: amData, error: amErr } = await supabase
        .from('master_am')
        .select('*')
        .eq('username', user)
        .eq('password', pass)
        .limit(1);

    if (amErr) throw new Error(amErr.message);

    if (amData && amData.length > 0) {
        const a = amData[0];
        return { success: true, user: { name: a.fullname, role: 'AM', code: a.username } };
    }

    return { success: false, message: 'Pengguna tidak ditemukan atau password salah.' };
}

export default function LoginPage() {
    const navigate = useNavigate();
    const setUser = useAuthStore((s) => s.setUser);

    const [allOptions, setAllOptions] = useState({ outlets: [], others: [] });
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [needsPassword, setNeedsPassword] = useState(false); // false = Outlet (no pass)
    const [loading, setLoading] = useState(false);
    const [optLoading, setOptLoading] = useState(true);
    const [error, setError] = useState('');

    const usernameRef = useRef(null);

    // Load autocomplete options (outlets + AM usernames)
    useEffect(() => {
        async function loadOptions() {
            try {
                const [outletRes, amRes] = await Promise.all([
                    supabase.from('master_outlets').select('outlet_name').order('outlet_name'),
                    supabase.from('master_am').select('username').order('username'),
                ]);
                const outlets = (outletRes.data || []).map((r) => r.outlet_name);
                const amNames = (amRes.data || []).map((r) => r.username);
                const hardcoded = [
                    import.meta.env.VITE_BOD_USERNAME,
                    import.meta.env.VITE_PROCUREMENT_USERNAME,
                ].filter(Boolean);
                setAllOptions({ outlets, others: [...hardcoded, ...amNames] });
            } catch {
                // fail silently — user can still type manually
            } finally {
                setOptLoading(false);
                usernameRef.current?.focus();
            }
        }
        loadOptions();
    }, []);

    // Dynamically show/hide password based on whether user chose an outlet
    function handleUsernameChange(e) {
        const val = e.target.value;
        setUsername(val);
        setError('');
        const isOutlet = allOptions.outlets.includes(val.trim().toUpperCase());
        setNeedsPassword(!isOutlet);
        if (isOutlet) {
            setPassword('');
            setShowPass(false);
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const result = await doLogin(username, password);
            if (result.success) {
                setUser(result.user);
                navigate('/');
            } else {
                setError(result.message);
            }
        } catch (err) {
            setError('Terjadi kesalahan server: ' + err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className={`${styles.wrapper} fade-up`}>
            <div className={styles.card}>

                {/* ── Header ── */}
                <div className={styles.header}>
                    <div className={styles.logoMark}>
                        <img
                            src="/alpro-logo.png"
                            alt="Apotek Alpro"
                            style={{ height: '52px', width: 'auto', objectFit: 'contain' }}
                        />
                    </div>
                    <h1 className={styles.title}>Alpro Short ED</h1>
                    <p className={styles.subtitle}>Sistem Monitoring Stok Expired Date Pendek</p>
                </div>

                {/* ── Form ── */}
                <form className={styles.form} onSubmit={handleSubmit} autoComplete="off">

                    {/* Username / Outlet Input */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="username">
                            Nama Pengguna / Toko
                        </label>
                        <input
                            id="username"
                            ref={usernameRef}
                            className="input-field"
                            list="login-datalist"
                            placeholder={optLoading ? 'Memuat daftar...' : 'Ketik nama toko atau user...'}
                            autoCapitalize="characters"
                            autoComplete="off"
                            disabled={optLoading}
                            value={username}
                            onChange={handleUsernameChange}
                            required
                            style={{ textTransform: 'uppercase' }}
                        />
                        <datalist id="login-datalist">
                            {[...allOptions.outlets, ...allOptions.others].map((opt) => (
                                <option key={opt} value={opt} />
                            ))}
                        </datalist>
                        {!needsPassword && username && (
                            <span className="form-hint">✓ Outlet terdaftar — bisa masuk langsung tanpa sandi.</span>
                        )}
                    </div>

                    {/* Password Input — animated show/hide */}
                    <div className={`${styles.passwordGroup} ${needsPassword ? styles.visible : styles.hidden}`}>
                        <div className="form-group">
                            <label className="form-label" htmlFor="password">Kata Sandi</label>
                            <div className={styles.inputWrapper}>
                                <input
                                    id="password"
                                    type={showPass ? 'text' : 'password'}
                                    className={`input-field ${styles.inputWithIcon}`}
                                    placeholder="Masukkan kata sandi"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required={needsPassword}
                                    autoComplete="current-password"
                                    style={{ textTransform: 'uppercase' }}
                                    tabIndex={needsPassword ? 0 : -1}
                                />
                                <button
                                    type="button"
                                    className={styles.passwordToggle}
                                    onClick={() => setShowPass((v) => !v)}
                                    tabIndex={needsPassword ? 0 : -1}
                                    aria-label={showPass ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                                >
                                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            <span className="form-hint">
                                *Area Manager / BOD / Procurement wajib mengisi sandi.
                            </span>
                        </div>
                    </div>

                    {/* Error Alert */}
                    {error && (
                        <div className={styles.alert} role="alert">
                            <AlertCircle size={16} style={{ flexShrink: 0 }} />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        className="btn btn-primary btn-block"
                        disabled={loading || optLoading}
                    >
                        {loading ? <><span className="spinner" />Memproses...</> : 'Masuk'}
                    </button>
                </form>

                {/* ── Footer ── */}
                <div className={styles.footer}>
                    <p className={styles.footerText}>
                        Alpro Short ED v2.0<br />
                        &copy; 2026 OASIS Apotek Alpro Indonesia
                    </p>
                </div>

            </div>
        </div>
    );
}
