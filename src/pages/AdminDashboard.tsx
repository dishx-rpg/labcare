import React, { useEffect, useState } from 'react';
import {
  Download,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { FAULT_CATEGORIES } from '../../shared/classifier.ts';
import type {
  CategoryConfig,
  EscalationRecord,
  FaultCategory,
  HandlerProfile,
  QueueReportItem,
  RoutingRule,
  User,
  UserRole,
  Zone,
} from '../../shared/types.ts';
import { AppLayout } from '../components/Layout.tsx';
import { PriorityText, StatusText } from '../components/StatusBadge.tsx';
import { apiFetch, downloadCsvExport } from '../lib/api.ts';

type AdminTab = 'queue' | 'routing' | 'handlers' | 'taxonomy' | 'users';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>('queue');
  const [kpis, setKpis] = useState<any>(null);
  const [queue, setQueue] = useState<QueueReportItem[]>([]);
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [handlers, setHandlers] = useState<HandlerProfile[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [categories, setCategories] = useState<CategoryConfig[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [escalations, setEscalations] = useState<EscalationRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // New routing rule form
  const [newRuleCat, setNewRuleCat] = useState<FaultCategory>('Electrical');
  const [newRuleZone, setNewRuleZone] = useState('CH');
  const [newRulePrimary, setNewRulePrimary] = useState<number>(1);
  const [newRuleBackup, setNewRuleBackup] = useState<number>(2);

  // New zone form
  const [zoneCode, setZoneCode] = useState('');
  const [zoneName, setZoneName] = useState('');
  const [zoneBuilding, setZoneBuilding] = useState('');
  const [zoneFloor, setZoneFloor] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [anRes, qRes, rRes, hRes, zRes, cRes, uRes, eRes] = await Promise.all([
        apiFetch<{ kpis: any }>('/api/analytics'),
        apiFetch<{ queue: QueueReportItem[] }>('/api/queue'),
        apiFetch<{ rules: RoutingRule[] }>('/api/routing-rules'),
        apiFetch<{ handlers: HandlerProfile[] }>('/api/handlers'),
        apiFetch<{ zones: Zone[] }>('/api/zones'),
        apiFetch<{ categories: CategoryConfig[] }>('/api/categories'),
        apiFetch<{ users: User[] }>('/api/users'),
        apiFetch<{ escalations: EscalationRecord[] }>('/api/escalations'),
      ]);
      setKpis(anRes.kpis);
      setQueue(qRes.queue);
      setRules(rRes.rules);
      setHandlers(hRes.handlers);
      setZones(zRes.zones);
      setCategories(cRes.categories);
      setUsers(uRes.users);
      setEscalations(eRes.escalations);
      if (hRes.handlers.length > 0) {
        setNewRulePrimary(hRes.handlers[0].id);
        setNewRuleBackup(hRes.handlers[1]?.id ?? hRes.handlers[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load command center data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ rules: RoutingRule[] }>('/api/routing-rules', {
        method: 'POST',
        body: JSON.stringify({
          category: newRuleCat,
          zone: newRuleZone,
          primaryHandlerId: newRulePrimary,
          backupHandlerId: newRuleBackup === newRulePrimary ? null : newRuleBackup,
        }),
      });
      setRules(res.rules);
      setNotice('Routing rule added.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create routing rule.');
    }
  };

  const handleToggleRule = async (rule: RoutingRule) => {
    try {
      const res = await apiFetch<{ rules: RoutingRule[] }>(`/api/routing-rules/${rule.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      setRules(res.rules);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update routing rule.');
    }
  };

  const handleDeleteRule = async (id: number) => {
    try {
      const res = await apiFetch<{ rules: RoutingRule[] }>(`/api/routing-rules/${id}`, {
        method: 'DELETE',
      });
      setRules(res.rules);
      setNotice('Routing rule removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete routing rule.');
    }
  };

  const handleToggleHandler = async (h: HandlerProfile) => {
    try {
      await apiFetch(`/api/handlers/${h.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isAvailable: !h.isAvailable }),
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle handler.');
    }
  };

  const handleHandlerCap = async (h: HandlerProfile, delta: number) => {
    try {
      await apiFetch(`/api/handlers/${h.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ maxCapacity: Math.max(1, h.maxCapacity + delta) }),
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update capacity.');
    }
  };

  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ zones: Zone[] }>('/api/zones', {
        method: 'POST',
        body: JSON.stringify({
          code: zoneCode,
          name: zoneName,
          building: zoneBuilding,
          floor: zoneFloor,
        }),
      });
      setZones(res.zones);
      setZoneCode('');
      setZoneName('');
      setZoneBuilding('');
      setZoneFloor('');
      setNotice('Laboratory zone added.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create zone.');
    }
  };

  const handleUpdateSla = async (cat: CategoryConfig, hours: number) => {
    if (hours < 1) return;
    try {
      const res = await apiFetch<{ categories: CategoryConfig[] }>(`/api/categories/${cat.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ defaultSlaHours: hours }),
      });
      setCategories(res.categories);
      setNotice(`Updated SLA window for ${cat.name} to ${hours}h.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update category SLA.');
    }
  };

  const handleRoleChange = async (userId: number, role: UserRole) => {
    try {
      const res = await apiFetch<{ users: User[] }>(`/api/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      setUsers(res.users);
      await loadAll();
      setNotice('User role updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user role.');
    }
  };

  const handleEscalationAction = async (id: number, status: 'Acknowledged' | 'Resolved') => {
    try {
      await apiFetch(`/api/escalations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update escalation.');
    }
  };

  return (
    <AppLayout
      title="Administrator Command Center"
      breadcrumb="LABCARE / System Operations & Governance"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => downloadCsvExport().catch((e) => setError(e.message))}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1326] text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={loadAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Total Reports', value: kpis?.totalReports ?? '—', tone: 'text-slate-900 dark:text-white' },
            { label: 'Open Reports', value: kpis?.openReports ?? '—', tone: 'text-indigo-600 dark:text-indigo-400' },
            { label: 'Critical Active', value: kpis?.criticalIncidents ?? '—', tone: 'text-rose-600 dark:text-rose-400' },
            { label: 'Resolved', value: kpis?.resolvedReports ?? '—', tone: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Unassigned', value: kpis?.unassignedReports ?? '—', tone: 'text-amber-600 dark:text-amber-400' },
            {
              label: 'Available Handlers',
              value: kpis ? `${kpis.availableHandlers}/${kpis.totalHandlers}` : '—',
              tone: 'text-cyan-600 dark:text-cyan-400',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="p-4 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800"
            >
              <div className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</div>
              <div className={`mt-1.5 text-2xl font-bold font-mono ${stat.tone}`}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-200">
            {error}
          </div>
        )}
        {notice && (
          <div className="p-3.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-200">
            {notice}
          </div>
        )}

        {/* Section Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800">
          {(
            [
              { id: 'queue', label: 'Queue & Escalations' },
              { id: 'routing', label: 'Routing Configuration' },
              { id: 'handlers', label: 'Handler Availability' },
              { id: 'taxonomy', label: 'Zones & Categories' },
              { id: 'users', label: 'User Management' },
            ] as Array<{ id: AdminTab; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading system state...</div>
        ) : (
          <>
            {/* Tab 1: Queue & Escalations */}
            {activeTab === 'queue' && (
              <div className="space-y-6">
                {/* Active Escalations */}
                <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-500" />
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Escalation Monitor ({escalations.filter((e) => e.status !== 'Resolved').length} open)
                      </h2>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {escalations.length === 0 ? (
                      <div className="p-5 text-xs text-slate-500">No escalations logged.</div>
                    ) : (
                      escalations.map((esc) => (
                        <div
                          key={esc.id}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 font-mono">
                              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                                {esc.reportId}
                              </span>
                              <span>·</span>
                              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                                {esc.severity}
                              </span>
                              <span>·</span>
                              <span className="text-slate-500">{esc.status}</span>
                            </div>
                            <div className="text-slate-700 dark:text-slate-200">{esc.reason}</div>
                          </div>
                          {esc.status !== 'Resolved' && (
                            <div className="flex items-center gap-2 shrink-0">
                              {esc.status === 'Open' && (
                                <button
                                  type="button"
                                  onClick={() => handleEscalationAction(esc.id, 'Acknowledged')}
                                  className="px-3 py-1.5 rounded-lg border border-amber-400 text-amber-600 dark:text-amber-400 font-semibold"
                                >
                                  Acknowledge
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleEscalationAction(esc.id, 'Resolved')}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold"
                              >
                                Resolve Escalation
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Deterministic Queue Monitor */}
                <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Deterministic Priority Queue ({queue.length} active)
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Strict total order: Priority (Critical → Low), then earliest timestamp, then Report ID.
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 dark:bg-[#070B14] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-3 px-4 font-medium">Rank</th>
                          <th className="py-3 px-4 font-medium">Report ID</th>
                          <th className="py-3 px-4 font-medium">Priority</th>
                          <th className="py-3 px-4 font-medium">Equipment & Zone</th>
                          <th className="py-3 px-4 font-medium">Status</th>
                          <th className="py-3 px-4 font-medium">Handler</th>
                          <th className="py-3 px-4 font-medium">Deterministic Ordering Rationale</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                        {queue.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                              #{item.queueRank}
                            </td>
                            <td className="py-3 px-4 font-mono font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                              {item.id}
                            </td>
                            <td className="py-3 px-4">
                              <PriorityText priority={item.priority} />
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-900 dark:text-white">
                                {item.equipmentName}
                              </div>
                              <div className="font-mono text-[11px] text-slate-500">
                                Zone {item.zone} · {item.finalCategory}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <StatusText status={item.status} />
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              {item.assignedHandlerName ?? 'Unassigned (Queued)'}
                            </td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-sm">
                              {item.queueReason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Routing Configuration */}
            {activeTab === 'routing' && (
              <div className="space-y-6">
                <form
                  onSubmit={handleAddRule}
                  className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
                >
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Category
                    </label>
                    <select
                      value={newRuleCat}
                      onChange={(e) => setNewRuleCat(e.target.value as FaultCategory)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-xs"
                    >
                      {FAULT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Zone (* for wildcard)
                    </label>
                    <input
                      type="text"
                      value={newRuleZone}
                      onChange={(e) => setNewRuleZone(e.target.value)}
                      placeholder="CH or *"
                      required
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Primary Handler
                    </label>
                    <select
                      value={newRulePrimary}
                      onChange={(e) => setNewRulePrimary(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-xs"
                    >
                      {handlers.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Backup Handler
                    </label>
                    <select
                      value={newRuleBackup}
                      onChange={(e) => setNewRuleBackup(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-xs"
                    >
                      {handlers.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Rule</span>
                  </button>
                </form>

                <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 dark:bg-[#070B14] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-3 px-4 font-medium">ID</th>
                          <th className="py-3 px-4 font-medium">Category</th>
                          <th className="py-3 px-4 font-medium">Zone</th>
                          <th className="py-3 px-4 font-medium">Primary Handler</th>
                          <th className="py-3 px-4 font-medium">Backup Handler</th>
                          <th className="py-3 px-4 font-medium">State</th>
                          <th className="py-3 px-4 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                        {rules.map((r) => (
                          <tr key={r.id}>
                            <td className="py-3 px-4 font-mono">#{r.id}</td>
                            <td className="py-3 px-4 font-semibold">{r.category}</td>
                            <td className="py-3 px-4 font-mono">{r.zone}</td>
                            <td className="py-3 px-4">{r.primaryHandlerName}</td>
                            <td className="py-3 px-4">{r.backupHandlerName ?? 'None'}</td>
                            <td className="py-3 px-4">
                              <button
                                type="button"
                                onClick={() => handleToggleRule(r)}
                                className={`text-xs font-semibold ${
                                  r.isActive
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-slate-400'
                                }`}
                              >
                                {r.isActive ? 'Active' : 'Disabled'}
                              </button>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteRule(r.id)}
                                className="p-1.5 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                aria-label="Delete routing rule"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Handler Availability */}
            {activeTab === 'handlers' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {handlers.map((h) => (
                  <div
                    key={h.id}
                    className="p-5 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 space-y-4"
                  >
                    <div>
                      <div className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                        {h.specialtyCategory} · Zone {h.primaryZone}
                      </div>
                      <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                        {h.name}
                      </div>
                      <div className="font-mono text-xs text-slate-500">{h.email}</div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Current Load / Capacity</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm">
                          {h.currentLoad} / {h.maxCapacity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleHandlerCap(h, -1)}
                          className="w-6 h-6 rounded border border-slate-300 dark:border-slate-700"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => handleHandlerCap(h, 1)}
                          className="w-6 h-6 rounded border border-slate-300 dark:border-slate-700"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleHandler(h)}
                      className={`w-full py-2 rounded-lg text-xs font-semibold ${
                        h.isAvailable
                          ? 'bg-emerald-600 text-white'
                          : 'bg-amber-600 text-white'
                      }`}
                    >
                      {h.isAvailable ? 'Available (Click to Set Unavailable)' : 'Unavailable (Click to Enable)'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 4: Zones & Categories */}
            {activeTab === 'taxonomy' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Laboratory Zones ({zones.length})
                  </h2>
                  <form onSubmit={handleCreateZone} className="grid grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={zoneCode}
                      onChange={(e) => setZoneCode(e.target.value)}
                      placeholder="Code (e.g. RO)"
                      maxLength={2}
                      required
                      className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] font-mono text-xs"
                    />
                    <input
                      type="text"
                      value={zoneName}
                      onChange={(e) => setZoneName(e.target.value)}
                      placeholder="Zone Name"
                      required
                      className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-xs"
                    />
                    <input
                      type="text"
                      value={zoneBuilding}
                      onChange={(e) => setZoneBuilding(e.target.value)}
                      placeholder="Building"
                      className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-xs"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={zoneFloor}
                        onChange={(e) => setZoneFloor(e.target.value)}
                        placeholder="Floor"
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-xs"
                      />
                      <button
                        type="submit"
                        className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
                      >
                        Add
                      </button>
                    </div>
                  </form>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                    {zones.map((z) => (
                      <div key={z.id} className="py-2.5 flex items-center justify-between">
                        <div>
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 mr-2">
                            {z.code}
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {z.name}
                          </span>
                        </div>
                        <span className="text-slate-500">
                          {z.building} · {z.floor}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Fault Categories & SLA Windows
                  </h2>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                    {categories.map((cat) => (
                      <div key={cat.id} className="py-3 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {cat.name}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 truncate">
                            {cat.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-semibold">{cat.defaultSlaHours}h SLA</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateSla(cat, cat.defaultSlaHours - 1)}
                            className="w-6 h-6 rounded border border-slate-300 dark:border-slate-700"
                          >
                            -
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateSla(cat, cat.defaultSlaHours + 1)}
                            className="w-6 h-6 rounded border border-slate-300 dark:border-slate-700"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 5: User Management */}
            {activeTab === 'users' && (
              <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 dark:bg-[#070B14] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-3 px-4 font-medium">Name</th>
                        <th className="py-3 px-4 font-medium">Email</th>
                        <th className="py-3 px-4 font-medium">Department</th>
                        <th className="py-3 px-4 font-medium">Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                            {u.name}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500">{u.email}</td>
                          <td className="py-3 px-4">{u.department}</td>
                          <td className="py-3 px-4">
                            <select
                              value={u.role}
                              onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                              className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-xs"
                            >
                              <option value="Reporter">Reporter</option>
                              <option value="Handler">Handler</option>
                              <option value="Administrator">Administrator</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
