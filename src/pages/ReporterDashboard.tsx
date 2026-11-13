import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FilePlus2,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import { classifyFaultDescription } from '../../shared/classifier.ts';
import { validateEquipmentId } from '../../shared/dfa.ts';
import { determinePriority } from '../../shared/priority.ts';
import type {
  FaultCategory,
  FaultReport,
  PriorityLevel,
  ReportStatus,
  Zone,
} from '../../shared/types.ts';
import { AppLayout } from '../components/Layout.tsx';
import { RoutingVisualizer } from '../components/RoutingVisualizer.tsx';
import { PriorityText, StatusText } from '../components/StatusBadge.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';

export default function ReporterDashboard() {
  const { user } = useAuth();
  const [reports, setReports] = useState<FaultReport[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Submission Form State
  const [showForm, setShowForm] = useState(false);
  const [reporterName, setReporterName] = useState(user?.name ?? '');
  const [reporterEmail, setReporterEmail] = useState(user?.email ?? '');
  const [department, setDepartment] = useState(user?.department ?? 'Molecular Biology');
  const [equipmentName, setEquipmentName] = useState('');
  const [equipmentId, setEquipmentId] = useState('LAB-CH-SPK-042');
  const [equipmentCode, setEquipmentCode] = useState('SPK-042');
  const [zone, setZone] = useState('CH');
  const [customZone, setCustomZone] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<PriorityLevel>('Medium');
  const [submittedAt, setSubmittedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastSubmittedReport, setLastSubmittedReport] = useState<FaultReport | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ReportStatus>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | PriorityLevel>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | FaultCategory>('ALL');

  // Selected Report Detail
  const [selectedReport, setSelectedReport] = useState<FaultReport | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [reportsRes, zonesRes] = await Promise.all([
        apiFetch<{ reports: FaultReport[] }>('/api/reports'),
        apiFetch<{ zones: Zone[] }>('/api/zones'),
      ]);
      setReports(reportsRes.reports);
      setZones(zonesRes.zones);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const idValidation = useMemo(() => validateEquipmentId(equipmentId), [equipmentId]);
  const liveClassification = useMemo(
    () => classifyFaultDescription(description, equipmentName),
    [description, equipmentName]
  );
  const livePriority = useMemo(
    () => determinePriority(urgency, description),
    [urgency, description]
  );

  const openReportDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await apiFetch<{ report: FaultReport }>(`/api/reports/${id}`);
      setSelectedReport(res.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load report details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!idValidation.valid) {
      setSubmitError(`Equipment ID rejected by DFA/Regex: ${idValidation.explanation}`);
      return;
    }
    if (description.trim().length < 8) {
      setSubmitError('Please enter a detailed fault description (at least 8 characters).');
      return;
    }

    const effectiveZone = zone === '__CUSTOM__' ? customZone.trim().toUpperCase() : zone;
    if (!effectiveZone) {
      setSubmitError('Please select or enter a laboratory zone code.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ report: FaultReport }>('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          reporterName,
          reporterEmail,
          department,
          equipmentName,
          equipmentId: equipmentId.trim(),
          equipmentCode: equipmentCode.trim(),
          zone: effectiveZone,
          description,
          urgency,
          submittedAt: new Date(submittedAt).toISOString(),
        }),
      });
      setLastSubmittedReport(res.report);
      setShowForm(false);
      setEquipmentName('');
      setDescription('');
      await loadData();
      await openReportDetail(res.report.id);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (priorityFilter !== 'ALL' && r.priority !== priorityFilter) return false;
      if (categoryFilter !== 'ALL' && r.finalCategory !== categoryFilter) return false;
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        r.equipmentName.toLowerCase().includes(q) ||
        r.equipmentId.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      );
    });
  }, [reports, search, statusFilter, priorityFilter, categoryFilter]);

  return (
    <AppLayout
      title="Reporter Workspace"
      breadcrumb="LABCARE / Fault Intake & Tracking"
      actions={
        <button
          type="button"
          onClick={() => {
            setShowForm((prev) => !prev);
            setSubmitError(null);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
        >
          <FilePlus2 className="w-4 h-4" />
          <span>{showForm ? 'Close Form' : 'Submit Fault Report'}</span>
        </button>
      }
    >
      <div className="space-y-6">
        {lastSubmittedReport && (
          <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/30 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-sm text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">
                  Report {lastSubmittedReport.id} created and routed ({lastSubmittedReport.status})
                </div>
                <div className="text-xs opacity-85 mt-0.5">
                  {lastSubmittedReport.routingExplanation}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLastSubmittedReport(null)}
              className="text-xs font-medium text-emerald-800 dark:text-emerald-300 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Fault Submission Form */}
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-6"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  New Laboratory Equipment Fault Report
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Equipment ID is verified by both DFA and Regex; classification and routing execute automatically on submit.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitError && (
              <div className="p-3.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Reporter Name
                </label>
                <input
                  type="text"
                  required
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Reporter Email
                </label>
                <input
                  type="email"
                  required
                  value={reporterEmail}
                  onChange={(e) => setReporterEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Department
                </label>
                <input
                  type="text"
                  required
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Equipment Name
                </label>
                <input
                  type="text"
                  required
                  value={equipmentName}
                  onChange={(e) => setEquipmentName(e.target.value)}
                  placeholder="e.g., Mass Spectrometer MS-9000"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Equipment ID (Format: LAB-XX-XXX-000)
                </label>
                <input
                  type="text"
                  required
                  value={equipmentId}
                  onChange={(e) => setEquipmentId(e.target.value)}
                  placeholder="LAB-CH-SPK-042"
                  className={`w-full px-3 py-2 rounded-lg border font-mono text-sm bg-slate-50 dark:bg-[#070B14] ${
                    idValidation.valid
                      ? 'border-emerald-400 dark:border-emerald-700'
                      : 'border-rose-400 dark:border-rose-700'
                  }`}
                />
                <div
                  className={`text-[11px] flex items-center gap-1 ${
                    idValidation.valid
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {idValidation.valid ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">
                    {idValidation.valid
                      ? `DFA state ${idValidation.dfa.finalState} & Regex agreed`
                      : idValidation.dfa.reason}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Equipment Asset Code
                </label>
                <input
                  type="text"
                  required
                  value={equipmentCode}
                  onChange={(e) => setEquipmentCode(e.target.value)}
                  placeholder="e.g., SPK-042"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Laboratory Zone
                </label>
                <select
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-sm"
                >
                  {zones.map((z) => (
                    <option key={z.code} value={z.code}>
                      {z.code} — {z.name}
                    </option>
                  ))}
                  <option value="__CUSTOM__">Other / Unregistered Zone Code</option>
                </select>
                {zone === '__CUSTOM__' && (
                  <input
                    type="text"
                    value={customZone}
                    onChange={(e) => setCustomZone(e.target.value)}
                    placeholder="Enter 2-letter code (e.g., ZZ)"
                    maxLength={4}
                    className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] font-mono text-sm"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Declared Urgency Level
                </label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as PriorityLevel)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-sm"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Submission Timestamp
                </label>
                <input
                  type="datetime-local"
                  value={submittedAt}
                  onChange={(e) => setSubmittedAt(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] font-mono text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Fault Description
              </label>
              <textarea
                rows={3}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe symptoms, error codes, abnormal noise, voltage issues, network drops, or safety hazards (e.g., smoke, sparks, gas leak)..."
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] text-sm"
              />
            </div>

            {/* Live Pre-submission Intelligence Preview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]">
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Predicted Fault Category
                </div>
                <div className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                  {liveClassification.category}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {liveClassification.explanation}
                </p>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Determined Priority
                </div>
                <div>
                  <PriorityText priority={livePriority.priority} />
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {livePriority.reason}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !idValidation.valid}
                className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold transition-colors"
              >
                {submitting ? 'Dispatching...' : 'Submit & Smart Dispatch'}
              </button>
            </div>
          </form>
        )}

        {/* Filter Bar */}
        <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by report ID, equipment name, ID, or symptoms..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs sm:text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="Assigned">Assigned</option>
              <option value="Queued">Queued</option>
              <option value="Accepted">Accepted</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs"
            >
              <option value="ALL">All Priorities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs"
            >
              <option value="ALL">All Categories</option>
              <option value="Electrical">Electrical</option>
              <option value="Mechanical">Mechanical</option>
              <option value="Software">Software</option>
              <option value="Network/Connectivity">Network/Connectivity</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-200">
            {error}
          </div>
        )}

        {/* Reports Table */}
        <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              My Fault Reports ({filteredReports.length})
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Click any row to inspect timeline, notes & routing trace
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading fault reports...</div>
          ) : filteredReports.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No fault reports match your filters.
              </div>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
              >
                Submit First Fault Report
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead className="bg-slate-50 dark:bg-[#070B14] text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4 font-medium">Report ID</th>
                    <th className="py-3 px-4 font-medium">Equipment</th>
                    <th className="py-3 px-4 font-medium">Zone</th>
                    <th className="py-3 px-4 font-medium">Category</th>
                    <th className="py-3 px-4 font-medium">Priority</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">Assigned Handler</th>
                    <th className="py-3 px-4 font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {filteredReports.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => openReportDetail(r.id)}
                      className={`cursor-pointer transition-colors ${
                        selectedReport?.id === r.id
                          ? 'bg-indigo-50/70 dark:bg-indigo-500/10'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                        {r.id}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {r.equipmentName}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {r.equipmentId}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">{r.zone}</td>
                      <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {r.finalCategory}
                      </td>
                      <td className="py-3 px-4">
                        <PriorityText priority={r.priority} />
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={r.status} />
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {r.assignedHandlerName ?? 'Queued'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {new Date(r.submittedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Report Detail Inspector */}
        {(selectedReport || detailLoading) && (
          <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-6">
            {detailLoading || !selectedReport ? (
              <div className="text-xs text-slate-500">Loading report inspection details...</div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
                      <span>{selectedReport.id}</span>
                      <span>·</span>
                      <span>{selectedReport.equipmentId}</span>
                      <span>·</span>
                      <span>Zone {selectedReport.zone}</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {selectedReport.equipmentName}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {selectedReport.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <PriorityText priority={selectedReport.priority} />
                    <StatusText status={selectedReport.status} />
                    <button
                      type="button"
                      onClick={() => setSelectedReport(null)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      aria-label="Close detail view"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Explainable Routing Visualizer */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Explainable Smart Routing Trace
                  </h4>
                  <RoutingVisualizer report={selectedReport} />
                </div>

                {/* Timeline & Resolution Notes */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Status History Timeline
                    </h4>
                    <div className="space-y-2.5">
                      {(selectedReport.history ?? []).map((h) => (
                        <div
                          key={h.id}
                          className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {h.status}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500">
                              {new Date(h.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-slate-600 dark:text-slate-300">{h.note}</div>
                          <div className="text-[11px] text-slate-400">Actor: {h.changedBy}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Technician Resolution Notes
                    </h4>
                    {(selectedReport.notes ?? []).length === 0 ? (
                      <div className="p-4 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>No resolution notes recorded yet.</span>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {(selectedReport.notes ?? []).map((n) => (
                          <div
                            key={n.id}
                            className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                                {n.authorName}
                              </span>
                              <span className="font-mono text-[11px] text-slate-500">
                                {new Date(n.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-slate-700 dark:text-slate-200">{n.note}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
