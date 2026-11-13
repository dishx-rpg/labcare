import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  FlaskConical,
  Play,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type {
  CategoryConfig,
  EscalationRecord,
  QueueReportItem,
} from '../../shared/types.ts';
import { DfaVisualizer } from '../components/DfaVisualizer.tsx';
import { AppLayout } from '../components/Layout.tsx';
import { PriorityText, StatusText } from '../components/StatusBadge.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';

type OpsTab = 'dfa' | 'simulation' | 'sla';

const SIM_SCENARIOS = [
  {
    id: 'unavailable_primary',
    title: 'Unavailable Primary Handler',
    desc: 'Simulates primary Electrical handler marked offline; verifies deterministic fallback to backup handler.',
  },
  {
    id: 'full_capacity',
    title: 'Full Handler Capacity',
    desc: 'Simulates all Mechanical specialists at maxCapacity; verifies clean Queued placement.',
  },
  {
    id: 'unknown_zone',
    title: 'Unknown Laboratory Zone',
    desc: 'Submits fault from unregistered zone XQ; verifies unknownZone flag and wildcard fallback.',
  },
  {
    id: 'critical_hazard',
    title: 'Critical Hazard Override & Escalation',
    desc: 'Submits Low urgency with "smoke and sparks" while handlers offline; verifies Critical override + escalation.',
  },
  {
    id: 'queue_conflict',
    title: 'Priority Queue Tie-Break Conflict',
    desc: 'Orders 4 concurrent reports across priorities, identical timestamps, and lexicographical IDs.',
  },
];

export default function OperationsLabPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<OpsTab>('dfa');

  // Simulation Lab state
  const [simResult, setSimResult] = useState<any>(null);
  const [simRunning, setSimRunning] = useState<string | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  // SLA Monitor state
  const [queue, setQueue] = useState<QueueReportItem[]>([]);
  const [categories, setCategories] = useState<CategoryConfig[]>([]);
  const [escalations, setEscalations] = useState<EscalationRecord[]>([]);
  const [slaLoading, setSlaLoading] = useState(false);

  const canSimulate = user?.role === 'Administrator' || user?.role === 'Handler';

  const loadSlaData = async () => {
    setSlaLoading(true);
    try {
      const [qRes, cRes] = await Promise.all([
        apiFetch<{ queue: QueueReportItem[] }>('/api/queue'),
        apiFetch<{ categories: CategoryConfig[] }>('/api/categories'),
      ]);
      setQueue(qRes.queue);
      setCategories(cRes.categories);
      if (canSimulate) {
        const eRes = await apiFetch<{ escalations: EscalationRecord[] }>('/api/escalations');
        setEscalations(eRes.escalations);
      }
    } catch {
      // handled silently if reporter
    } finally {
      setSlaLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'sla') {
      loadSlaData();
    }
  }, [activeTab]);

  const runSimulation = async (scenarioId: string) => {
    setSimRunning(scenarioId);
    setSimError(null);
    try {
      const res = await apiFetch<any>('/api/simulate', {
        method: 'POST',
        body: JSON.stringify({ scenarioId }),
      });
      setSimResult(res);
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'Simulation failed.');
    } finally {
      setSimRunning(null);
    }
  };

  const catSlaMap = new Map(categories.map((c) => [c.name, c.defaultSlaHours]));

  return (
    <AppLayout
      title="DFA, Simulation & SLA Operations Lab"
      breadcrumb="LABCARE / Algorithmic Diagnostics"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('dfa')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'dfa'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Interactive DFA & Regex</span>
          </button>

          {canSimulate && (
            <button
              type="button"
              onClick={() => setActiveTab('simulation')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'simulation'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>Simulation Lab</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('sla')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'sla'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>SLA & Escalation Monitor</span>
          </button>
        </div>

        {/* Tab 1: Interactive DFA */}
        {activeTab === 'dfa' && <DfaVisualizer />}

        {/* Tab 2: Simulation Lab */}
        {activeTab === 'simulation' && canSimulate && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Isolated Routing & Queue Simulation Lab
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Executes the production routing and priority engines on synthetic state snapshots
                  without altering live database records.
                </p>
              </div>

              {simError && (
                <div className="p-3 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-200">
                  {simError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {SIM_SCENARIOS.map((sc) => (
                  <div
                    key={sc.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        {sc.title}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {sc.desc}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={simRunning !== null}
                      onClick={() => runSimulation(sc.id)}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{simRunning === sc.id ? 'Running...' : 'Run Simulation'}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {simResult && (
              <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div>
                    <div className="text-xs text-slate-500">Simulation Outcome</div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {simResult.scenario}
                    </h3>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 text-sm font-bold ${
                      simResult.passed
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {simResult.passed ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        PASS
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4" />
                        FAIL
                      </>
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]">
                    <div className="font-semibold text-slate-500 mb-1">Expected Outcome</div>
                    <div className="font-mono text-slate-900 dark:text-white">
                      {simResult.expectedOutcome}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]">
                    <div className="font-semibold text-slate-500 mb-1">Actual Outcome</div>
                    <div className="font-mono text-cyan-700 dark:text-cyan-300">
                      {simResult.actualOutcome}
                    </div>
                  </div>
                </div>

                {simResult.decision?.trace && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Simulated Decision Trace
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-lg">
                      {simResult.decision.trace.map((step: any) => (
                        <div key={step.step} className="p-3 text-xs flex items-start gap-3">
                          <span className="font-mono font-bold text-indigo-500">
                            0{step.step}
                          </span>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {step.stage} ({step.outcome})
                            </div>
                            <div className="text-slate-600 dark:text-slate-300">{step.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {simResult.queuePreview && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Simulated Priority Queue Resolution
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-lg">
                      {simResult.queuePreview.map((item: any) => (
                        <div key={item.id} className="p-3 text-xs flex items-center justify-between gap-4">
                          <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                            #{item.queueRank} · {item.id}
                          </span>
                          <span className="text-slate-600 dark:text-slate-300 flex-1">
                            {item.queueReason}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: SLA & Escalation Monitor */}
        {activeTab === 'sla' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Pending Reports & SLA Age Monitor
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Highlights overdue SLA breaches based on category target windows and Critical hazards.
                  </p>
                </div>
              </div>

              {slaLoading ? (
                <div className="p-6 text-xs text-slate-500">Loading SLA telemetry...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 dark:bg-[#070B14] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-3 px-4 font-medium">Report ID</th>
                        <th className="py-3 px-4 font-medium">Equipment</th>
                        <th className="py-3 px-4 font-medium">Priority</th>
                        <th className="py-3 px-4 font-medium">Status</th>
                        <th className="py-3 px-4 font-medium">Age</th>
                        <th className="py-3 px-4 font-medium">SLA Target</th>
                        <th className="py-3 px-4 font-medium">Compliance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {queue.map((item) => {
                        const slaHours = catSlaMap.get(item.finalCategory) ?? 24;
                        const ageHours = item.ageMinutes / 60;
                        const isOverdue = ageHours > slaHours;
                        return (
                          <tr key={item.id}>
                            <td className="py-3 px-4 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                              {item.id}
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-900 dark:text-white">
                                {item.equipmentName}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {item.finalCategory} · Zone {item.zone}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <PriorityText priority={item.priority} />
                            </td>
                            <td className="py-3 px-4">
                              <StatusText status={item.status} />
                            </td>
                            <td className="py-3 px-4 font-mono">
                              {ageHours >= 1
                                ? `${ageHours.toFixed(1)}h`
                                : `${item.ageMinutes}m`}
                            </td>
                            <td className="py-3 px-4 font-mono">{slaHours}h</td>
                            <td className="py-3 px-4">
                              {isOverdue ? (
                                <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  Overdue
                                </span>
                              ) : item.priority === 'Critical' ? (
                                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  Critical Watch
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Within SLA
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {canSimulate && (
              <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Escalation History ({escalations.length})
                  </h2>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                  {escalations.map((esc) => (
                    <div key={esc.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-mono font-semibold text-slate-900 dark:text-white">
                          {esc.reportId} · {esc.severity} · {esc.status}
                        </div>
                        <div className="text-slate-600 dark:text-slate-300">{esc.reason}</div>
                      </div>
                      <div className="font-mono text-slate-500">
                        {new Date(esc.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
