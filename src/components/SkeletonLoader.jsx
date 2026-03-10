/**
 * SkeletonLoader.jsx
 * Komponen Skeleton berbasis Vanilla CSS — tidak butuh library eksternal.
 * Animasi pulse didefinisikan di globals.css (.skeleton, .skeleton-card, dll).
 */

// ── KPI Card Skeleton (mirip ukuran kartu KPI asli)
export function KpiSkeletonGrid({ count = 3 }) {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
        }}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="skeleton-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="skeleton-text" style={{ width: '60%' }} />
                        <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 8 }} />
                    </div>
                    <div className="skeleton-text" style={{ width: '80%', height: 28 }} />
                    <div className="skeleton-text" style={{ width: '50%' }} />
                </div>
            ))}
        </div>
    );
}

// ── Table Row Skeleton
export function TableSkeletonRows({ rows = 8, cols = 4 }) {
    return (
        <div style={{ padding: '8px 0' }}>
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border-light)', alignItems: 'center' }}>
                    {Array.from({ length: cols }).map((_, j) => (
                        <div
                            key={j}
                            className="skeleton-text"
                            style={{
                                flex: j === 0 ? 2 : 1,
                                height: j === 0 ? 16 : 12,
                                opacity: 1 - (j * 0.15)
                            }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

// ── Chart Area Skeleton
export function ChartSkeleton({ height = 280 }) {
    return (
        <div className="skeleton" style={{ height, borderRadius: 12, margin: '16px' }} />
    );
}

// ── Full Page Skeleton (KPI + Charts + Table)
export function DashboardSkeleton({ kpiCount = 3, chartHeight = 260 }) {
    return (
        <div className="fade-up">
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <div className="skeleton-text" style={{ width: '30%', height: 24, marginBottom: 10 }} />
                <div className="skeleton-text" style={{ width: '50%' }} />
            </div>

            {/* KPI Cards */}
            <KpiSkeletonGrid count={kpiCount} />

            {/* Charts row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div className="skeleton-card"><ChartSkeleton height={chartHeight} /></div>
                <div className="skeleton-card"><ChartSkeleton height={chartHeight} /></div>
            </div>

            {/* Table */}
            <div className="skeleton-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div className="skeleton-text" style={{ width: '25%', height: 18 }} />
                </div>
                <TableSkeletonRows rows={7} cols={5} />
            </div>
        </div>
    );
}
