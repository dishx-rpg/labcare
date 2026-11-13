import type { FaultCategory } from './types.ts';

/**
 * Deterministic Keyword-Based Fault Classifier with Fixed Conflict Resolution
 *
 * Categories (exactly 5):
 *   1. Electrical
 *   2. Mechanical
 *   3. Software
 *   4. Network/Connectivity
 *   5. Other
 *
 * Tie-break Precedence (safety-critical first):
 *   Electrical > Mechanical > Network/Connectivity > Software > Other
 */

export const FAULT_CATEGORIES: FaultCategory[] = [
  'Electrical',
  'Mechanical',
  'Software',
  'Network/Connectivity',
  'Other',
];

const TIE_BREAK_ORDER: FaultCategory[] = [
  'Electrical',
  'Mechanical',
  'Network/Connectivity',
  'Software',
  'Other',
];

interface WeightedKeyword {
  term: string;
  weight: number;
}

export const CATEGORY_KEYWORDS: Record<Exclude<FaultCategory, 'Other'>, WeightedKeyword[]> = {
  Electrical: [
    { term: 'short circuit', weight: 3 },
    { term: 'arc flash', weight: 3 },
    { term: 'electric shock', weight: 3 },
    { term: 'ground fault', weight: 3 },
    { term: 'power supply', weight: 3 },
    { term: 'voltage', weight: 2 },
    { term: 'breaker', weight: 2 },
    { term: 'fuse', weight: 2 },
    { term: 'spark', weight: 2 },
    { term: 'sparks', weight: 2 },
    { term: 'smoke', weight: 2 },
    { term: 'burning', weight: 2 },
    { term: 'wiring', weight: 2 },
    { term: 'surge', weight: 2 },
    { term: 'battery', weight: 2 },
    { term: 'psu', weight: 2 },
    { term: 'electrode', weight: 2 },
    { term: 'overheating', weight: 1 },
    { term: 'power', weight: 1 },
    { term: 'current', weight: 1 },
  ],
  Mechanical: [
    { term: 'door latch', weight: 3 },
    { term: 'vacuum seal', weight: 3 },
    { term: 'bearing', weight: 2 },
    { term: 'motor', weight: 2 },
    { term: 'rotor', weight: 2 },
    { term: 'vibration', weight: 2 },
    { term: 'centrifuge', weight: 2 },
    { term: 'jam', weight: 2 },
    { term: 'jammed', weight: 2 },
    { term: 'valve', weight: 2 },
    { term: 'pump', weight: 2 },
    { term: 'leak', weight: 2 },
    { term: 'leaking', weight: 2 },
    { term: 'belt', weight: 2 },
    { term: 'shaft', weight: 2 },
    { term: 'alignment', weight: 2 },
    { term: 'seal', weight: 2 },
    { term: 'hinge', weight: 2 },
    { term: 'pressure', weight: 1 },
    { term: 'noise', weight: 1 },
  ],
  Software: [
    { term: 'error code', weight: 3 },
    { term: 'calibration software', weight: 3 },
    { term: 'blue screen', weight: 3 },
    { term: 'firmware', weight: 2 },
    { term: 'crash', weight: 2 },
    { term: 'crashed', weight: 2 },
    { term: 'freeze', weight: 2 },
    { term: 'frozen', weight: 2 },
    { term: 'driver', weight: 2 },
    { term: 'exception', weight: 2 },
    { term: 'license', weight: 2 },
    { term: 'software', weight: 2 },
    { term: 'boot', weight: 2 },
    { term: 'update', weight: 1 },
    { term: 'bug', weight: 2 },
    { term: 'ui', weight: 1 },
    { term: 'hang', weight: 1 },
    { term: 'os', weight: 1 },
  ],
  'Network/Connectivity': [
    { term: 'packet loss', weight: 3 },
    { term: 'cannot connect', weight: 3 },
    { term: 'ethernet', weight: 2 },
    { term: 'wifi', weight: 2 },
    { term: 'wi-fi', weight: 2 },
    { term: 'network', weight: 2 },
    { term: 'disconnect', weight: 2 },
    { term: 'disconnected', weight: 2 },
    { term: 'dns', weight: 2 },
    { term: 'dhcp', weight: 2 },
    { term: 'ssh', weight: 2 },
    { term: 'mqtt', weight: 2 },
    { term: 'router', weight: 2 },
    { term: 'switch', weight: 2 },
    { term: 'latency', weight: 2 },
    { term: 'offline', weight: 2 },
    { term: 'telemetry', weight: 2 },
    { term: 'lan', weight: 2 },
    { term: 'ip', weight: 2 },
    { term: 'port', weight: 1 },
  ],
};

export interface ClassificationResult {
  category: FaultCategory;
  matchedKeywords: string[];
  scores: Record<FaultCategory, number>;
  tieBroken: boolean;
  explanation: string;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function classifyFaultDescription(
  description: string,
  equipmentName = ''
): ClassificationResult {
  const haystack = `${equipmentName} ${description}`.toLowerCase();

  const scores: Record<FaultCategory, number> = {
    Electrical: 0,
    Mechanical: 0,
    Software: 0,
    'Network/Connectivity': 0,
    Other: 0,
  };

  const matchedByCategory: Record<FaultCategory, string[]> = {
    Electrical: [],
    Mechanical: [],
    Software: [],
    'Network/Connectivity': [],
    Other: [],
  };

  (Object.keys(CATEGORY_KEYWORDS) as Array<Exclude<FaultCategory, 'Other'>>).forEach((cat) => {
    for (const kw of CATEGORY_KEYWORDS[cat]) {
      const pattern = new RegExp(`\\b${escapeRegExp(kw.term)}\\b`, 'i');
      if (pattern.test(haystack)) {
        scores[cat] += kw.weight;
        matchedByCategory[cat].push(kw.term);
      }
    }
  });

  const maxScore = Math.max(
    scores.Electrical,
    scores.Mechanical,
    scores.Software,
    scores['Network/Connectivity']
  );

  if (maxScore === 0) {
    return {
      category: 'Other',
      matchedKeywords: [],
      scores,
      tieBroken: false,
      explanation:
        'No specialized Electrical, Mechanical, Network/Connectivity, or Software keywords matched; classified as Other.',
    };
  }

  const tiedCategories = TIE_BREAK_ORDER.filter((cat) => cat !== 'Other' && scores[cat] === maxScore);
  const selected = tiedCategories[0];
  const tieBroken = tiedCategories.length > 1;

  const allMatched = matchedByCategory[selected];
  const scoreSummary = (Object.keys(scores) as FaultCategory[])
    .filter((c) => scores[c] > 0)
    .map((c) => `${c}: ${scores[c]}`)
    .join(', ');

  const explanation = tieBroken
    ? `Tie detected at score ${maxScore} between [${tiedCategories.join(', ')}]. Deterministic safety-first precedence (${TIE_BREAK_ORDER.join(' > ')}) selected ${selected} (matched: ${allMatched.join(', ')}; scores: ${scoreSummary}).`
    : `Classified as ${selected} with highest keyword weight score ${maxScore} (matched: ${allMatched.join(', ')}; scores: ${scoreSummary}).`;

  return {
    category: selected,
    matchedKeywords: allMatched,
    scores,
    tieBroken,
    explanation,
  };
}
