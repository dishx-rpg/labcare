import { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FAULT_CATEGORIES } from '../../shared/classifier.ts';
import type { FaultCategory, FaultReport, PriorityLevel, Zone } from '../../shared/types.ts';
import { AppLayout } from '../components/Layout.tsx';
import { apiFetch, downloadCsvExport } from '../lib/api.ts';

const CHART_COLORS = ['#6366f1', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899'];
const PRIORITY_COLORS: Record<string, string> = {
  Critical: '#f43f5e',
  High: '#f59e0b',
  Medium: '#6366f1',
  Low: '#64748b',
};

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [reports, setReports] = useState<FaultReport[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Heatmap filters
  const [heatCategory, setHeatCategory] = useState<'ALL' | FaultCategory>('ALL');
  const [heatPriority, setHeatPriority] = useState<'ALL' | PriorityLevel>('ALL');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [anRes, repRes, zRes] = await Promise.all([
        apiFetch<any>('/api/analytics'),
        apiFetch<{ reports: FaultReport[] }>('/api/reports'),
        apiFetch<{ zones: Zone[] }>('/api/zones'),
      ]);
      setAnalytics(anRes);
      setReports(repRes.reports);
      setZones(zRes.zones);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const heatmapFiltered = useMemo(() => {
    return reports.filter((r) => {
      if (heatCategory !== 'ALL' && r.finalCategory !== heatCategory) return false;
      if (heatPriority !== 'ALL' && r.priority !== heatPriority) return false;
      return true;
    });
  }, [reports, heatCategory, heatPriority]);

  const zoneCodes = useMemo(() => {
    const set = new Set([...zones.map((z) => z.code), ...reports.map((r) => r.zone)]);
    return Array.from(set);
  }, [zones, reports]);

  const maxHeatCell = useMemo(() => {
    let max = 1;
    for (const z of zoneCodes) {
      for (const c of FAULT_CATEGORIES) {
        const cnt = heatmapFiltered.filter((r) => r.zone === z && r.finalCategory === c).length;
        if (cnt > max) max = cnt;
      }
    }
    return max;
  }, [heatmapFiltered, zoneCodes]);

  return (
    <AppLayout
      title="Analytics & Laboratory Heatmap"
      breadcrumb="LABCARE / Empirical Fault Telemetry"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => downloadCsvExport().catch((e) => setError(e.message))}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1326] text-xs font-semibold whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-200">
            {error}
          </div>
        )}

        {loading || !analytics ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Computing analytics from database records...
          </div>
        ) : (
          <>
            {/* 6 Recharts Visualizations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 1. Reports by Category */}
              <div className="p-5 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 space-y-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  1. Reports by Fault Category
                </h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.charts.byCategory}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Reports" radius={[6, 6, 0, 0]}>
                        {analytics.charts.byCategory.map((_: any, i: number) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 2. Reports by Priority */}
              <div className="p-5 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 space-y-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  2. Reports by Priority Level
                </h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.charts.byPriority}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Reports" radius={[6, 6, 0, 0]}>
                        {analytics.charts.byPriority.map((entry: any) => (
                          <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name] || '#6366f1'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 3. Reports by Laboratory Zone */}
              <div className="p-5 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 space-y-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  3. Reports by Laboratory Zone
                </h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.charts.byZone}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                      <XAxis dataKey="zone" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" name="Total Faults" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="critical" name="Critical" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 4. Resolved vs Pending Reports */}
              <div className="p-5 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 space-y-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  4. Resolved vs Pending Reports
                </h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.charts.resolvedVsPending}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={88}
                        paddingAngle={4}
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#6366f1" />
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 5. Handler Workload vs Capacity */}
              <div className="p-5 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 space-y-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  5. Handler Workload vs Max Capacity
                </h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.charts.handlerWorkload}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="activeLoad" name="Active Load" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="capacity" name="Max Capacity" fill="#475569" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 6. Monthly Fault Trends */}
              <div className="p-5 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 space-y-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  6. Monthly Fault Trends (6-Month Window)
                </h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.charts.monthlyTrends}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="total"
                        name="Submitted"
                        stroke="#6366f1"
                        fill="#6366f1"
                        fillOpacity={0.2}
                      />
                      <Area
                        type="monotone"
                        dataKey="resolved"
                        name="Resolved"
                        stroke="#10b981"
                        fill="#10b981"
                        fillOpacity={0.2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Laboratory Heatmap */}
            <div className="p-5 sm:p-6 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Laboratory Fault Distribution Heatmap (Zone × Category)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Filter matrix by category or priority to pinpoint high-frequency failure hotspots.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={heatCategory}
                    onChange={(e) => setHeatCategory(e.target.value as any)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-xs"
                  >
                    <option value="ALL">All Categories</option>
                    {FAULT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    value={heatPriority}
                    onChange={(e) => setHeatPriority(e.target.value as any)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-xs"
                  >
                    <option value="ALL">All Priorities</option>
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3 font-medium">Zone</th>
                      {FAULT_CATEGORIES.map((c) => (
                        <th key={c} className="py-2.5 px-3 font-medium text-center">
                          {c}
                        </th>
                      ))}
                      <th className="py-2.5 px-3 font-medium text-right">Zone Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {zoneCodes.map((zCode) => {
                      const zoneName = zones.find((z) => z.code === zCode)?.name ?? zCode;
                      const zoneTotal = heatmapFiltered.filter((r) => r.zone === zCode).length;
                      return (
                        <tr key={zCode}>
                          <td className="py-2.5 px-3">
                            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 mr-2">
                              {zCode}
                            </span>
                            <span className="text-slate-700 dark:text-slate-300">{zoneName}</span>
                          </td>
                          {FAULT_CATEGORIES.map((c) => {
                            const count = heatmapFiltered.filter(
                              (r) => r.zone === zCode && r.finalCategory === c
                            ).length;
                            const intensity = count / maxHeatCell;
                            const bgClass =
                              count === 0
                                ? 'bg-slate-100 dark:bg-[#070B14] text-slate-400'
                                : intensity >= 0.75
                                ? 'bg-indigo-600 text-white'
                                : intensity >= 0.4
                                ? 'bg-indigo-500/40 text-indigo-950 dark:text-white'
                                : 'bg-cyan-500/20 text-cyan-900 dark:text-cyan-200';
                            return (
                              <td key={c} className="p-1.5 text-center">
                                <div
                                  className={`py-2 px-3 rounded-md font-mono font-semibold ${bgClass}`}
                                >
                                  {count}
                                </div>
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {zoneTotal}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
