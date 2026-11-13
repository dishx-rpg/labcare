import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cpu,
  GitMerge,
  Layers,
  Moon,
  ShieldAlert,
  Sun,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';

export default function LandingPage() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [equipImgFailed, setEquipImgFailed] = useState(false);

  const workspacePath =
    user?.role === 'Administrator'
      ? '/admin'
      : user?.role === 'Handler'
      ? '/handler'
      : user
      ? '/reporter'
      : '/auth';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-slate-100">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-[#070B14]/90 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 h-16 flex items-center justify-between gap-8">
          <Link
            to="/"
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 flex items-center gap-2.5"
          >
            <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </span>
            <span>LABCARE</span>
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="#capabilities"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#how-it-works"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            <a
              href="#benefits"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Benefits
            </a>
            <a
              href="#demo-roles"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Demo Access
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to={workspacePath}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <span>{user ? 'Open Console' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Split */}
      <section className="max-w-[1440px] mx-auto px-6 sm:px-10 pt-10 pb-12 lg:pt-14 lg:pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="lg:col-span-6 flex flex-col justify-between py-2 space-y-8"
          >
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Intelligent Laboratory Dispatch</span>
                <span aria-hidden="true">·</span>
                <span>DFA Validated</span>
                <span aria-hidden="true">·</span>
                <span>Role-Based Engineering System</span>
              </div>

              <h1
                className="text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.12]"
                style={{ textWrap: 'balance' }}
              >
                Deterministic fault triage and smart dispatch for research laboratories.
              </h1>

              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                LABCARE validates structured equipment identifiers with a 16-state deterministic
                finite automaton, classifies technical faults, enforces critical safety priority
                overrides, and routes incidents to available specialists without oversubscription.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  to={workspacePath}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  <span>{user ? 'Go to Dashboard' : 'Launch LABCARE'}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                {!user && (
                  <Link
                    to="/auth?mode=register"
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0D1326] hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-800 dark:text-slate-200 text-sm font-semibold transition-colors whitespace-nowrap"
                  >
                    Create Account
                  </Link>
                )}
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="inline-flex items-center gap-2 px-3.5 py-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                  aria-label="Toggle color theme"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
              <span>5 Laboratory Wings</span>
              <span aria-hidden="true">·</span>
              <span>5 Fault Categories</span>
              <span aria-hidden="true">·</span>
              <span>4 Priority Tiers</span>
              <span aria-hidden="true">·</span>
              <span>20 Automated Verification Tests</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="lg:col-span-6"
          >
            <div className="h-full min-h-[300px] lg:min-h-[420px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 relative">
              {!heroImgFailed ? (
                <img
                  src="/src/assets/images/hero_laboratory_console_1794564739650.jpg"
                  alt="Modern analytical research laboratory bench and instrumentation suite"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-slate-200">
                  <Activity className="w-12 h-12 text-cyan-400 mb-3" />
                  <div className="text-sm font-semibold">LABCARE Laboratory Operations Wing</div>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-200">
                <span className="font-mono">ID Standard: LAB-[A-Z]&#123;2&#125;-[A-Z]&#123;3&#125;-[0-9]&#123;3&#125;</span>
                <span>SQLite Transactional Dispatch</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* 4-Column Algorithmic Guarantees Strip */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              title: '01. DFA + Regex Parity',
              metric: '16 States',
              desc: 'Character-level automaton transitions verified 1:1 against regular expression.',
            },
            {
              title: '02. Fault Classification',
              metric: '5 Categories',
              desc: 'Weighted keyword scoring with safety-first conflict tie-breaking.',
            },
            {
              title: '03. Priority Queue',
              metric: '4 Tiers',
              desc: 'Hazard override escalation with timestamp and ID tie-breakers.',
            },
            {
              title: '04. Atomic Routing',
              metric: 'Zero Double-Book',
              desc: 'Primary/backup capacity guards wrapped in immediate DB transactions.',
            },
          ].map((item) => (
            <div
              key={item.title}
              className="p-5 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 space-y-1.5"
            >
              <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                {item.title}
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                {item.metric}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section
        id="capabilities"
        className="max-w-[1440px] mx-auto px-6 sm:px-10 py-14 border-t border-slate-200 dark:border-slate-800/80"
      >
        <div className="max-w-2xl space-y-2 mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Core Engineering Capabilities
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">
            Every intake submission passes through four explainable, auditable modules before a
            technician is dispatched.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 p-6 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                <Cpu className="w-4 h-4" />
                <span>Formal Language Validation</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Interactive DFA & Regex Verification
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Inspect every transition from <code className="font-mono">q0</code> to accepting
                state <code className="font-mono">q14</code>. Invalid prefixes, lowercase wings, or
                truncated serials route immediately to <code className="font-mono">q_dead</code>{' '}
                with exact character-index diagnostics.
              </p>
            </div>
            <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 aspect-[4/3] bg-slate-900">
              {!equipImgFailed ? (
                <img
                  src="/src/assets/images/lab_zone_instruments_1794564739615.jpg"
                  alt="Calibrated laboratory mass spectrometer and diagnostic rack"
                  referrerPolicy="no-referrer"
                  onError={() => setEquipImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <Cpu className="w-10 h-10" />
                </div>
              )}
            </div>
          </div>

          <div className="p-6 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              <Layers className="w-4 h-4" />
              <span>Deterministic Triage</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Keyword Classifier & Tie-Breaker
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Automatically assigns Electrical, Mechanical, Software, Network/Connectivity, or
              Other using weighted terms and a safety-first precedence order, with full manual
              override logging for authorized handlers.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-4 h-4" />
              <span>Safety Override Engine</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Critical Hazard Escalation
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Detects fire, smoke, sparks, gas leaks, radiation, and cryogenic spills to force
              Critical priority and open SLA escalation tickets immediately when capacity is full.
            </p>
          </div>

          <div className="lg:col-span-2 p-6 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-violet-600 dark:text-violet-400">
              <GitMerge className="w-4 h-4" />
              <span>Explainable Smart Dispatch</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Primary/Backup Routing, Queueing & Simulation Lab
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Evaluates zone-category routing rules, verifies live handler availability and workload
              capacity, prevents duplicate assignments, handles unknown zones, and includes an
              isolated Simulation Lab plus 6 live Recharts analytics views.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        className="max-w-[1440px] mx-auto px-6 sm:px-10 py-14 border-t border-slate-200 dark:border-slate-800/80"
      >
        <div className="max-w-2xl space-y-2 mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            How the Dispatch Pipeline Works
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">
            Four deterministic stages turn an unstructured lab fault report into an auditable work
            order.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {[
            {
              step: '01. Submit & Validate',
              detail:
                'Reporter logs equipment fault. The 16-state DFA and Regex verify the Equipment ID before persistence.',
            },
            {
              step: '02. Classify & Prioritize',
              detail:
                'Keyword weights predict fault category while hazard rules enforce Critical safety overrides.',
            },
            {
              step: '03. Smart Route & Lock',
              detail:
                'Inside an atomic database transaction, LABCARE selects the Primary or Backup handler with open capacity.',
            },
            {
              step: '04. Resolve & Audit',
              detail:
                'Handlers accept or reject (triggering auto-reroute), append resolution notes, and update live analytics.',
            },
          ].map((item) => (
            <div
              key={item.step}
              className="p-5 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 space-y-2"
            >
              <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                {item.step}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits & Demo Accounts */}
      <section
        id="benefits"
        className="max-w-[1440px] mx-auto px-6 sm:px-10 py-14 border-t border-slate-200 dark:border-slate-800/80"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 space-y-5">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Built for Operational Accountability
            </h2>
            <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              {[
                'Zero silent drops: unroutable or capacity-blocked Critical reports escalate automatically.',
                '100% explainable decisions: every report stores its complete routing trace and priority rationale.',
                'Concurrent submission safety: SQLite write transactions prevent handler oversubscription.',
                'Dual-backend academic delivery: live Node.js runtime plus matching Python Flask + SQLite package.',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            id="demo-roles"
            className="lg:col-span-6 p-6 rounded-xl bg-white dark:bg-[#0D1326] border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Pre-Configured Role Demo Accounts
              </h3>
              <Link
                to="/auth"
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Open Login Page
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-3 font-medium">Role</th>
                    <th className="py-2 pr-3 font-medium">Email</th>
                    <th className="py-2 font-medium">Password</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 font-mono">
                  <tr>
                    <td className="py-2.5 pr-3 font-sans font-semibold text-slate-900 dark:text-white">
                      Reporter
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                      reporter@labcare.edu
                    </td>
                    <td className="py-2.5 text-slate-600 dark:text-slate-300">LabCare2026!</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-3 font-sans font-semibold text-slate-900 dark:text-white">
                      Handler
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                      handler@labcare.edu
                    </td>
                    <td className="py-2.5 text-slate-600 dark:text-slate-300">LabCare2026!</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-3 font-sans font-semibold text-slate-900 dark:text-white">
                      Administrator
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                      admin@labcare.edu
                    </td>
                    <td className="py-2.5 text-slate-600 dark:text-slate-300">LabCare2026!</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800/80 py-8 px-6 sm:px-10">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div>LABCARE — Intelligent Laboratory Equipment Fault Reporter & Smart Dispatch System</div>
          <div className="flex items-center gap-5">
            <Link to="/auth" className="hover:text-slate-900 dark:hover:text-white">
              Sign In
            </Link>
            <Link to="/auth?mode=register" className="hover:text-slate-900 dark:hover:text-white">
              Register
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
