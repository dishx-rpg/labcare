import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  GitBranch,
  ShieldAlert,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type { FaultReport, RoutingTraceStep } from '../../shared/types.ts';

function StepIcon({ outcome }: { outcome: RoutingTraceStep['outcome'] }) {
  switch (outcome) {
    case 'pass':
      return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
    case 'fallback':
      return <GitBranch className="w-4 h-4 text-amber-500 shrink-0" />;
    case 'blocked':
      return <XCircle className="w-4 h-4 text-rose-500 shrink-0" />;
    case 'escalate':
      return <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />;
    default:
      return <AlertTriangle className="w-4 h-4 text-indigo-500 shrink-0" />;
  }
}

export function RoutingVisualizer({ report }: { report: FaultReport }) {
  const trace = report.routingTrace ?? [];

  return (
    <div className="space-y-4">
      {/* Pipeline Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">1. DFA & Zone</div>
          <div className="mt-1 font-mono text-xs font-semibold text-slate-900 dark:text-white truncate">
            {report.equipmentId}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Zone {report.zone} · {report.dfaValid ? 'DFA Valid' : 'Invalid'}
          </div>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">2. Classification</div>
          <div className="mt-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
            {report.finalCategory}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
            {report.matchedKeywords.length > 0
              ? `Matched: ${report.matchedKeywords.join(', ')}`
              : 'No keyword matches'}
          </div>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">3. Priority Engine</div>
          <div className="mt-1 text-xs font-semibold text-slate-900 dark:text-white">
            {report.priority}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
            Declared urgency: {report.urgency}
          </div>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">4. Final Dispatch</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-cyan-600 dark:text-cyan-400 truncate">
            <UserCheck className="w-3.5 h-3.5 shrink-0" />
            <span>{report.assignedHandlerName ?? 'Queued (Unassigned)'}</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 capitalize">
            Path: {report.assignmentType}
          </div>
        </div>
      </div>

      {/* Step-by-step Trace */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800/80 bg-white dark:bg-[#0D1326]">
        {trace.length === 0 ? (
          <div className="p-4 text-xs text-slate-500">
            No detailed trace recorded for this report.
          </div>
        ) : (
          trace.map((step) => (
            <div key={step.step} className="p-3.5 flex items-start gap-3">
              <div className="mt-0.5">
                <StepIcon outcome={step.outcome} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                  <span className="font-mono text-slate-400">0{step.step}.</span>
                  <span>{step.stage}</span>
                  <ArrowRight className="w-3 h-3 text-slate-400" />
                  <span className="uppercase font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                    {step.outcome}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {step.detail}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Reasoning Summary */}
      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 bg-slate-50 dark:bg-[#070B14] p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
        <div>
          <span className="font-semibold text-slate-900 dark:text-white">Classification rationale: </span>
          {report.classificationExplanation}
        </div>
        <div>
          <span className="font-semibold text-slate-900 dark:text-white">Priority rationale: </span>
          {report.priorityReason}
        </div>
        <div>
          <span className="font-semibold text-slate-900 dark:text-white">Routing rationale: </span>
          {report.routingExplanation}
        </div>
      </div>
    </div>
  );
}
