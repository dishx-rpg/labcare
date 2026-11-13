import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Play,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import {
  DFA_SAMPLE_CASES,
  DFA_STATES,
  EQUIPMENT_ID_REGEX_SOURCE,
  validateEquipmentId,
  type DfaStateId,
} from '../../shared/dfa.ts';

const LINEAR_STATES: DfaStateId[] = [
  'q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7',
  'q8', 'q9', 'q10', 'q11', 'q12', 'q13', 'q14',
];

const EDGE_LABELS: Record<string, string> = {
  q0: "'L'",
  q1: "'A'",
  q2: "'B'",
  q3: "'-'",
  q4: 'A-Z',
  q5: 'A-Z',
  q6: "'-'",
  q7: 'A-Z',
  q8: 'A-Z',
  q9: 'A-Z',
  q10: "'-'",
  q11: '0-9',
  q12: '0-9',
  q13: '0-9',
};

export function DfaVisualizer({
  initialValue = 'LAB-CH-SPK-042',
  onSelectId,
}: {
  initialValue?: string;
  onSelectId?: (id: string) => void;
}) {
  const [input, setInput] = useState(initialValue);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);

  const result = validateEquipmentId(input);
  const totalSteps = result.dfa.steps.length;

  useEffect(() => {
    setActiveStepIndex(totalSteps - 1);
    setIsPlaying(false);
  }, [input, totalSteps]);

  useEffect(() => {
    if (!isPlaying) return;
    if (activeStepIndex >= totalSteps - 1) {
      setIsPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setActiveStepIndex((prev) => prev + 1);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [isPlaying, activeStepIndex, totalSteps]);

  const currentStep =
    activeStepIndex >= 0 && activeStepIndex < totalSteps
      ? result.dfa.steps[activeStepIndex]
      : null;

  const highlightedState: DfaStateId = currentStep
    ? currentStep.toState
    : 'q0';

  const visitedStates = new Set<DfaStateId>(['q0']);
  for (let i = 0; i <= activeStepIndex && i < totalSteps; i++) {
    visitedStates.add(result.dfa.steps[i].toState);
  }

  const handleChooseSample = (id: string) => {
    setInput(id);
    onSelectId?.(id);
  };

  return (
    <div className="space-y-6">
      {/* Input & Parity Header */}
      <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="flex-1 space-y-2">
            <label
              htmlFor="dfa-equipment-id-input"
              className="block text-sm font-semibold text-slate-900 dark:text-slate-100"
            >
              Equipment ID String under Automaton Inspection
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                id="dfa-equipment-id-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="LAB-CH-SPK-042"
                className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#070B14] font-mono text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveStepIndex(-1);
                    setIsPlaying(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Animate Trace</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStepIndex((p) => Math.max(-1, p - 1))}
                  disabled={activeStepIndex < 0}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                  aria-label="Previous transition step"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveStepIndex((p) => Math.min(totalSteps - 1, p + 1))
                  }
                  disabled={activeStepIndex >= totalSteps - 1}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                  aria-label="Next transition step"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setActiveStepIndex(totalSteps - 1);
                  }}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Reset to final state"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Parity Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
            <div className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                DFA Result
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                {result.dfa.valid ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    Accepted
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                    <XCircle className="w-4 h-4" />
                    Rejected
                  </span>
                )}
              </div>
            </div>

            <div className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Regex Match
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                {result.regex.valid ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    Matched
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                    <XCircle className="w-4 h-4" />
                    Rejected
                  </span>
                )}
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14]">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                DFA ≡ Regex Parity
              </div>
              <div className="mt-1 text-sm font-semibold font-mono text-cyan-600 dark:text-cyan-400">
                {result.agreement ? '100% AGREE' : 'MISMATCH'}
              </div>
            </div>
          </div>
        </div>

        {/* Character Tape */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              Equivalent Regex:{' '}
              <code className="font-mono text-indigo-600 dark:text-indigo-300">
                {EQUIPMENT_ID_REGEX_SOURCE}
              </code>
            </span>
            <span className="font-mono">
              Current State: <strong className="text-slate-900 dark:text-white">{highlightedState}</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {input.length === 0 ? (
              <span className="text-xs font-mono text-slate-400">Empty input tape</span>
            ) : (
              input.split('').map((ch, idx) => {
                const step = result.dfa.steps[idx];
                const isActive = idx === activeStepIndex;
                const isEvaluated = idx <= activeStepIndex;
                const isFail = step && !step.validTransition;
                return (
                  <button
                    key={`${idx}-${ch}`}
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      setActiveStepIndex(idx);
                    }}
                    className={`w-9 h-10 rounded-lg border font-mono text-sm font-semibold flex flex-col items-center justify-center transition-colors ${
                      isActive
                        ? 'ring-2 ring-cyan-500 border-cyan-500 bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                        : isEvaluated && isFail
                        ? 'border-rose-400 dark:border-rose-500/60 bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        : isEvaluated
                        ? 'border-emerald-300 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] text-slate-500'
                    }`}
                  >
                    <span>{ch === ' ' ? '␣' : ch}</span>
                    <span className="text-[9px] font-normal opacity-70">{idx}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Explanation Banner */}
        <div
          className={`rounded-lg border p-3.5 text-sm ${
            result.valid
              ? 'border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
              : 'border-rose-200 dark:border-rose-800/70 bg-rose-50/70 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200'
          }`}
        >
          {result.explanation}
        </div>
      </div>

      {/* Interactive SVG Automaton Graph */}
      <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Interactive DFA State Transition Diagram (q0 → q14, F = &#123;q14&#125;)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click any character on the tape above or press Animate Trace to inspect state transitions.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span>Active: {highlightedState}</span>
            <span>·</span>
            <span>Accepting: q14 (double ring)</span>
            <span>·</span>
            <span>Trap: q_dead</span>
          </div>
        </div>

        <div className="overflow-x-auto pb-2">
          <svg
            viewBox="0 0 1160 220"
            className="w-full min-w-[920px] h-auto select-none"
            role="img"
            aria-label="Deterministic Finite Automaton State Diagram"
          >
            <defs>
              <marker
                id="dfa-arrow"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" className="fill-slate-400 dark:fill-slate-600" />
              </marker>
              <marker
                id="dfa-arrow-active"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" className="fill-cyan-500" />
              </marker>
            </defs>

            {/* Start arrow into q0 */}
            <line
              x1="10"
              y1="66"
              x2="32"
              y2="66"
              strokeWidth="2"
              className="stroke-indigo-500"
              markerEnd="url(#dfa-arrow-active)"
            />

            {/* Linear transitions q0 -> q14 */}
            {LINEAR_STATES.slice(0, -1).map((stateId, idx) => {
              const x1 = 56 + idx * 74;
              const x2 = 56 + (idx + 1) * 74;
              const stepMatched =
                currentStep &&
                currentStep.fromState === stateId &&
                currentStep.toState === LINEAR_STATES[idx + 1];
              const isVisitedEdge =
                visitedStates.has(stateId) &&
                visitedStates.has(LINEAR_STATES[idx + 1]);

              return (
                <g key={`edge-${stateId}`}>
                  <line
                    x1={x1 + 20}
                    y1={66}
                    x2={x2 - 22}
                    y2={66}
                    strokeWidth={stepMatched ? 2.5 : 1.5}
                    className={
                      stepMatched
                        ? 'stroke-cyan-500'
                        : isVisitedEdge
                        ? 'stroke-indigo-500'
                        : 'stroke-slate-300 dark:stroke-slate-700'
                    }
                    markerEnd={stepMatched ? 'url(#dfa-arrow-active)' : 'url(#dfa-arrow)'}
                  />
                  <text
                    x={(x1 + x2) / 2}
                    y={52}
                    textAnchor="middle"
                    className={`text-[10px] font-mono ${
                      stepMatched
                        ? 'fill-cyan-500 font-semibold'
                        : 'fill-slate-500 dark:fill-slate-400'
                    }`}
                  >
                    {EDGE_LABELS[stateId]}
                  </text>
                </g>
              );
            })}

            {/* Trap arrow from active dead transition */}
            {highlightedState === 'q_dead' && (
              <path
                d="M 580 90 Q 580 135 580 148"
                fill="none"
                strokeWidth="2"
                strokeDasharray="4 3"
                className="stroke-rose-500"
              />
            )}

            {/* Linear State Nodes */}
            {LINEAR_STATES.map((stateId, idx) => {
              const cx = 56 + idx * 74;
              const cy = 66;
              const isCurrent = highlightedState === stateId;
              const isVisited = visitedStates.has(stateId);
              const isAccept = stateId === 'q14';

              return (
                <g key={stateId}>
                  {isAccept && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={24}
                      fill="none"
                      strokeWidth="1.5"
                      className={
                        isCurrent && result.dfa.valid
                          ? 'stroke-emerald-500'
                          : 'stroke-slate-300 dark:stroke-slate-700'
                      }
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={19}
                    strokeWidth={isCurrent ? 2.5 : 1.5}
                    className={
                      isCurrent && isAccept
                        ? 'fill-emerald-500/20 stroke-emerald-500'
                        : isCurrent
                        ? 'fill-cyan-500/20 stroke-cyan-500'
                        : isVisited
                        ? 'fill-indigo-500/15 stroke-indigo-500'
                        : 'fill-slate-100 dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700'
                    }
                  />
                  <text
                    x={cx}
                    y={cy + 4}
                    textAnchor="middle"
                    className={`text-[11px] font-mono font-semibold ${
                      isCurrent
                        ? 'fill-slate-900 dark:fill-white'
                        : 'fill-slate-700 dark:fill-slate-300'
                    }`}
                  >
                    {stateId}
                  </text>
                </g>
              );
            })}

            {/* Trap State q_dead */}
            <g>
              <rect
                x="510"
                y="150"
                width="140"
                height="44"
                rx="10"
                strokeWidth={highlightedState === 'q_dead' ? 2.5 : 1.5}
                className={
                  highlightedState === 'q_dead'
                    ? 'fill-rose-500/20 stroke-rose-500'
                    : 'fill-slate-100 dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700'
                }
              />
              <text
                x="580"
                y="176"
                textAnchor="middle"
                className={`text-xs font-mono font-semibold ${
                  highlightedState === 'q_dead'
                    ? 'fill-rose-600 dark:fill-rose-300'
                    : 'fill-slate-500 dark:fill-slate-400'
                }`}
              >
                q_dead (Reject Trap)
              </text>
            </g>
          </svg>
        </div>
      </div>

      {/* Sample Test Cases + Transition Trace Table */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Sample Cases */}
        <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Preset Valid & Invalid Equipment ID Cases
          </h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {DFA_SAMPLE_CASES.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => handleChooseSample(sample.id)}
                className={`w-full py-2.5 px-3 flex items-center justify-between gap-3 text-left rounded-lg transition-colors ${
                  input === sample.id
                    ? 'bg-indigo-50 dark:bg-indigo-500/15'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                    {sample.id}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {sample.label}
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold whitespace-nowrap ${
                    sample.expectedValid
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {sample.expectedValid ? 'Valid' : 'Invalid'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Step-by-Step Transition Log */}
        <div className="bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Executed Transition Trace ({result.dfa.steps.length} steps)
          </h3>
          <div className="max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 dark:bg-[#070B14] text-slate-500 dark:text-slate-400 sticky top-0">
                <tr>
                  <th className="py-2 px-3 font-medium">Idx</th>
                  <th className="py-2 px-3 font-medium">Char</th>
                  <th className="py-2 px-3 font-medium">Transition</th>
                  <th className="py-2 px-3 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 font-mono">
                {result.dfa.steps.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 px-3 text-center text-slate-500">
                      Enter an Equipment ID to inspect character-level DFA transitions.
                    </td>
                  </tr>
                ) : (
                  result.dfa.steps.map((step) => (
                    <tr
                      key={step.index}
                      onClick={() => {
                        setIsPlaying(false);
                        setActiveStepIndex(step.index);
                      }}
                      className={`cursor-pointer transition-colors ${
                        step.index === activeStepIndex
                          ? 'bg-cyan-50 dark:bg-cyan-500/10'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2 px-3 text-slate-500">{step.index}</td>
                      <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                        '{step.char}'
                      </td>
                      <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                        {step.rule}
                      </td>
                      <td className="py-2 px-3">
                        {step.validTransition ? (
                          <span className="text-emerald-600 dark:text-emerald-400">OK</span>
                        ) : (
                          <span className="text-rose-600 dark:text-rose-400">TRAP</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* State Reference Summary */}
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Active state note:{' '}
            <span className="text-slate-800 dark:text-slate-200 font-medium">
              {DFA_STATES.find((s) => s.id === highlightedState)?.description}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
