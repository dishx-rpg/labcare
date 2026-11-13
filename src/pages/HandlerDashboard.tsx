import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Edit3,
  MessageSquarePlus,
  Play,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { FAULT_CATEGORIES } from '../../shared/classifier.ts';
import type {
  FaultCategory,
  FaultReport,
  HandlerProfile,
  QueueReportItem,
} from '../../shared/types.ts';
import { AppLayout } from '../components/Layout.tsx';
import { RoutingVisualizer } from '../components/RoutingVisualizer.tsx';
import { PriorityText, StatusText } from '../components/StatusBadge.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';

export default function HandlerDashboard() {
  const { user } = useAuth();
  const [reports, setReports] = useState<FaultReport[]>([]);
  const [queue, setQueue] = useState<QueueReportItem[]>([]);
  const [handlers, setHandlers] = useState<HandlerProfile[]>([]);
  const [selectedReport, setSelectedReport] = useState<FaultReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action states
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [overrideCategory, setOverrideCategory] = useState<FaultCategory>('Electrical');
  const [overrideReason, setOverrideReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadAll = async (preserveId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [repRes, qRes, hRes] = await Promise.all([
        apiFetch<{ reports: FaultReport[] }>('/api/reports'),
        apiFetch<{ queue: QueueReportItem[] }>('/api/queue'),
        apiFetch<{ handlers: HandlerProfile[] }>('/api/handlers'),
      ]);
      setReports(repRes.reports);
      setQueue(qRes.queue);
      setHandlers(hRes.handlers);

      const targetId = preserveId ?? selectedReport?.id ?? repRes.reports[0]?.id;
      if (targetId) {
        const detail = await apiFetch<{ report: FaultReport }>(`/api/reports/${targetId}`);
        setSelectedReport(detail.report);
        setOverrideCategory(detail.report.finalCategory);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load handler workbench.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const myHandlerProfile = handlers.find((h) => h.userId === user?.id) ?? handlers[0];

  const selectReport = async (id: string) => {
    setShowRejectBox(false);
    setRejectReason('');
    setFeedback(null);
    try {
      const detail = await apiFetch<{ report: FaultReport }>(`/api/reports/${id}`);
      setSelectedReport(detail.report);
      setOverrideCategory(detail.report.finalCategory);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch report.');
    }
  };

  const handleToggleAvailability = async (h: HandlerProfile) => {
    setActionBusy(true);
    try {
      await apiFetch(`/api/handlers/${h.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isAvailable: !h.isAvailable }),
      });
      await loadAll(selectedReport?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update availability.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCapacityChange = async (h: HandlerProfile, delta: number) => {
    const nextCap = Math.max(1, Math.min(20, h.maxCapacity + delta));
    setActionBusy(true);
    try {
      await apiFetch(`/api/handlers/${h.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ maxCapacity: nextCap }),
      });
      await loadAll(selectedReport?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update capacity.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleRespond = async (action: 'accept' | 'reject') => {
    if (!selectedReport) return;
    if (action === 'reject' && !rejectReason.trim()) {
      setError('Please specify a reason before rejecting an assignment.');
      return;
    }
    setActionBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/reports/${selectedReport.id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action, reason: rejectReason }),
      });
      setShowRejectBox(false);
      setRejectReason('');
      setFeedback(
        action === 'accept'
          ? `Assignment accepted for ${selectedReport.id}.`
          : `Assignment rejected and automatically rerouted for ${selectedReport.id}.`
      );
      await loadAll(selectedReport.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleStatusUpdate = async (status: 'In Progress' | 'Resolved') => {
    if (!selectedReport) return;
    setActionBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/reports/${selectedReport.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          note: resolutionNote.trim() || undefined,
        }),
      });
      setResolutionNote('');
      setFeedback(`Report ${selectedReport.id} updated to ${status}.`);
      await loadAll(selectedReport.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReport || !resolutionNote.trim()) return;
    setActionBusy(true);
    try {
      await apiFetch(`/api/reports/${selectedReport.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note: resolutionNote.trim() }),
      });
      setResolutionNote('');
      setFeedback('Resolution note saved.');
      await loadAll(selectedReport.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add note.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleOverrideCategory = async () => {
    if (!selectedReport) return;
    setActionBusy(true);
    try {
      await apiFetch(`/api/reports/${selectedReport.id}/category`, {
        method: 'PATCH',
        body: JSON.stringify({
          category: overrideCategory,
          reason: overrideReason,
        }),
      });
      setOverrideReason('');
      setFeedback(`Category manually updated to ${overrideCategory}.`);
      await loadAll(selectedReport.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update category.');
    } finally {
      setActionBusy(false);
    }
  };

  // Sort assigned/visible reports using the deterministic queue order
  const queueRankMap = new Map(queue.map((q) => [q.id, q.queueRank]));
  const prioritizedReports = [...reports].sort((a, b) => {
    const rA = queueRankMap.get(a.id) ?? 9999;
    const rB = queueRankMap.get(b.id) ?? 9999;
    return rA - rB;
  });

  return (
    <AppLayout
      title="Handler Workbench"
      breadcrumb="LABCARE / Specialist Dispatch Queue"
      actions={
        <button
          type="button"
          onClick={() => loadAll(selectedReport?.id)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Queue</span>
        </button>
      }
    >
      <div className="space-y-6">
        {/* Handler Availability & Capacity Control */}
        {myHandlerProfile && (
          <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Active Specialist Profile · {myHandlerProfile.specialtyCategory} · Zone {myHandlerProfile.primaryZone}
              </div>
              <div className="text-base font-bold text-slate-900 dark:text-white">
                {myHandlerProfile.name}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] flex items-center gap-3">
                <span className="text-xs text-slate-500 dark:text-slate-400">Workload</span>
                <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                  {myHandlerProfile.currentLoad} / {myHandlerProfile.maxCapacity}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => handleCapacityChange(myHandlerProfile, -1)}
                    className="w-6 h-6 rounded border border-slate-300 dark:border-slate-700 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-800"
                    aria-label="Decrease capacity"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => handleCapacityChange(myHandlerProfile, 1)}
                    className="w-6 h-6 rounded border border-slate-300 dark:border-slate-700 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-800"
                    aria-label="Increase capacity"
                  >
                    +
                  </button>
                </div>
              </div>

              <button
                type="button"
                disabled={actionBusy}
                onClick={() => handleToggleAvailability(myHandlerProfile)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  myHandlerProfile.isAvailable
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                }`}
              >
                {myHandlerProfile.isAvailable ? 'Available for Dispatch' : 'Marked Unavailable'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-200">
            {error}
          </div>
        )}
        {feedback && (
          <div className="p-3.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-200">
            {feedback}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left Priority Task List */}
          <div className="xl:col-span-5 bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Priority Task List ({prioritizedReports.length})
              </h2>
              <span className="text-[11px] font-mono text-slate-500">
                Critical → High → Medium → Low
              </span>
            </div>

            {loading ? (
              <div className="p-6 text-xs text-slate-500">Loading assigned queue...</div>
            ) : prioritizedReports.length === 0 ? (
              <div className="p-6 text-xs text-slate-500">
                No active reports currently assigned or queued.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[640px] overflow-y-auto">
                {prioritizedReports.map((r) => {
                  const qRank = queueRankMap.get(r.id);
                  const isSelected = selectedReport?.id === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => selectReport(r.id)}
                      className={`w-full p-4 text-left transition-colors space-y-1.5 ${
                        isSelected
                          ? 'bg-indigo-50/80 dark:bg-indigo-500/15'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-mono text-xs">
                          {qRank && (
                            <span className="text-slate-400">#{qRank}</span>
                          )}
                          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                            {r.id}
                          </span>
                        </div>
                        <PriorityText priority={r.priority} />
                      </div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {r.equipmentName}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>
                          Zone {r.zone} · {r.finalCategory}
                        </span>
                        <StatusText status={r.status} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Task Detail & Resolution Controls */}
          <div className="xl:col-span-7 space-y-6">
            {!selectedReport ? (
              <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
                Select a fault report from the priority list to inspect and resolve.
              </div>
            ) : (
              <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div className="space-y-1">
                    <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {selectedReport.id} · {selectedReport.equipmentId} · Submitted{' '}
                      {new Date(selectedReport.submittedAt).toLocaleString()}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {selectedReport.equipmentName}
                    </h3>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Reporter: {selectedReport.reporterName} ({selectedReport.department}) ·{' '}
                      {selectedReport.reporterEmail}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <PriorityText priority={selectedReport.priority} />
                    <StatusText status={selectedReport.status} />
                  </div>
                </div>

                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                  {selectedReport.description}
                </p>

                {/* Primary Handler Decision Controls */}
                {selectedReport.status !== 'Resolved' && (
                  <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] space-y-4">
                    <div className="flex flex-wrap items-center gap-2.5">
                      {(selectedReport.status === 'Assigned' ||
                        selectedReport.status === 'Queued') && (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => handleRespond('accept')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Accept Assignment</span>
                        </button>
                      )}

                      {selectedReport.status === 'Assigned' && (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => setShowRejectBox((v) => !v)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject & Auto-Reroute</span>
                        </button>
                      )}

                      {(selectedReport.status === 'Accepted' ||
                        selectedReport.status === 'Assigned') && (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => handleStatusUpdate('In Progress')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Start Work (In Progress)</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => handleStatusUpdate('Resolved')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mark Resolved</span>
                      </button>
                    </div>

                    {showRejectBox && (
                      <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <label className="block text-xs font-semibold text-rose-700 dark:text-rose-300">
                          Rejection Reason (required for audit & automatic backup reroute)
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="e.g., Currently locked in cleanroom maintenance, lacking high-voltage cert..."
                            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1326] text-xs"
                          />
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => handleRespond('reject')}
                            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold whitespace-nowrap"
                          >
                            Confirm Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Resolution Note Box */}
                    <form onSubmit={handleAddNote} className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Add Diagnostic / Resolution Note
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={resolutionNote}
                          onChange={(e) => setResolutionNote(e.target.value)}
                          placeholder="Log calibration findings, replaced parts, or verification tests..."
                          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1326] text-xs"
                        />
                        <button
                          type="submit"
                          disabled={actionBusy || !resolutionNote.trim()}
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1326] hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold whitespace-nowrap"
                        >
                          <MessageSquarePlus className="w-3.5 h-3.5" />
                          <span>Save Note</span>
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Manual Category Correction */}
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                    <Edit3 className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Manual Category Override (Predicted: {selectedReport.predictedCategory})</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={overrideCategory}
                      onChange={(e) => setOverrideCategory(e.target.value as FaultCategory)}
                      className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-xs"
                    >
                      {FAULT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Optional override justification..."
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-xs"
                    />
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={handleOverrideCategory}
                      className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-indigo-600 hover:opacity-90 text-white text-xs font-semibold whitespace-nowrap"
                    >
                      Update Category
                    </button>
                  </div>
                </div>

                {/* Routing Visualizer */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Dispatch & Routing Trace
                  </h4>
                  <RoutingVisualizer report={selectedReport} />
                </div>

                {/* Notes & History */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Resolution Notes ({(selectedReport.notes ?? []).length})
                    </h4>
                    <div className="space-y-2 max-h-52 overflow-y-auto">
                      {(selectedReport.notes ?? []).map((n) => (
                        <div
                          key={n.id}
                          className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs"
                        >
                          <div className="font-semibold text-indigo-600 dark:text-indigo-400">
                            {n.authorName} · {new Date(n.createdAt).toLocaleString()}
                          </div>
                          <div className="mt-1 text-slate-700 dark:text-slate-200">{n.note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Audit History ({(selectedReport.history ?? []).length})
                    </h4>
                    <div className="space-y-2 max-h-52 overflow-y-auto">
                      {(selectedReport.history ?? []).map((h) => (
                        <div
                          key={h.id}
                          className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs"
                        >
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {h.status} · {new Date(h.createdAt).toLocaleString()}
                          </div>
                          <div className="mt-0.5 text-slate-600 dark:text-slate-300">{h.note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
