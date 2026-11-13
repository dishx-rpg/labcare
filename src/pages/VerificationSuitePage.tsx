import { useState } from 'react';
import { CheckCircle2, Play, XCircle } from 'lucide-react';
import type { VerificationTestResult } from '../../shared/types.ts';
import { AppLayout } from '../components/Layout.tsx';
import { apiFetch } from '../lib/api.ts';

interface SuiteResponse {
  total: number;
  passed: number;
  failed: number;
  results: VerificationTestResult[];
}

export default function VerificationSuitePage() {
  const [data, setData] = useState<SuiteResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunTests = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await apiFetch<SuiteResponse>('/api/tests/run');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test execution failed.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <AppLayout
      title="Automated Verification Suite"
      breadcrumb="LABCARE / Algorithm & Integrity Test Runner"
      actions={
        <button
          type="button"
          disabled={running}
          onClick={handleRunTests}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
        >
          <Play className="w-4 h-4" />
          <span>{running ? 'Executing 20 Tests...' : 'Run All Tests'}</span>
        </button>
      }
    >
      <div className="space-y-6">
        <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Live Deterministic Engine Test Suite (20 Cases)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Executes live assertions against DFA, Regex parity, Keyword Classification, Priority
              Hazard Overrides, Smart Routing, Backup Fallbacks, Queue Tie-Breaking, Unknown Zones,
              and Duplicate Prevention.
            </p>
          </div>

          {data && (
            <div className="flex items-center gap-4 shrink-0 font-mono">
              <div className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-xs">
                Total: <strong>{data.total}</strong>
              </div>
              <div className="px-3.5 py-2 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-700 dark:text-emerald-300">
                Passed: <strong>{data.passed}</strong>
              </div>
              <div className="px-3.5 py-2 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300">
                Failed: <strong>{data.failed}</strong>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-200">
            {error}
          </div>
        )}

        {!data ? (
          <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center space-y-4">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Tests have not been executed in this session yet.
            </div>
            <button
              type="button"
              onClick={handleRunTests}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
            >
              <Play className="w-4 h-4" />
              <span>Run All 20 Verification Tests</span>
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 dark:bg-[#070B14] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4 font-medium">ID</th>
                    <th className="py-3 px-4 font-medium">Suite</th>
                    <th className="py-3 px-4 font-medium">Test Name</th>
                    <th className="py-3 px-4 font-medium">Expected Result</th>
                    <th className="py-3 px-4 font-medium">Actual Result</th>
                    <th className="py-3 px-4 font-medium text-right">Time</th>
                    <th className="py-3 px-4 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {data.results.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                        {t.id}
                      </td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{t.suite}</td>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                        {t.name}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                        {t.expected}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                        {t.actual}
                      </td>
                      <td className="py-3 px-4 font-mono text-right text-slate-500 whitespace-nowrap">
                        {t.durationMs.toFixed(2)} ms
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {t.passed ? (
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            PASS
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-rose-600 dark:text-rose-400">
                            <XCircle className="w-3.5 h-3.5" />
                            FAIL
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
