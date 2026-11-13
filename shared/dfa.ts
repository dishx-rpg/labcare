/**
 * LABCARE Deterministic Finite Automaton (DFA) & Regular Expression Validator
 *
 * Structured Equipment ID Format: LAB-<ZONE>-<CAT>-<NNN>
 *   - Prefix: Literal "LAB"
 *   - Separator 1: '-'
 *   - Zone Code: 2 uppercase ASCII letters [A-Z]{2} (e.g., CH, BI, PH, EL, CR)
 *   - Separator 2: '-'
 *   - Equipment Category Code: 3 uppercase ASCII letters [A-Z]{3} (e.g., SPK, PCR, OSC)
 *   - Separator 3: '-'
 *   - Unit Serial Number: 3 decimal digits [0-9]{3} (e.g., 042)
 *
 * Equivalent Regular Expression: /^LAB-[A-Z]{2}-[A-Z]{3}-[0-9]{3}$/
 *
 * Formal DFA 5-tuple M = (Q, Σ, δ, q0, F):
 *   Q = { q0, q1, q2, q3, q4, q5, q6, q7, q8, q9, q10, q11, q12, q13, q14, q_dead }
 *   q0 = Start state
 *   F = { q14 } (Accepting state)
 *   q_dead = Trap / Rejection state
 */

export type DfaStateId =
  | 'q0'
  | 'q1'
  | 'q2'
  | 'q3'
  | 'q4'
  | 'q5'
  | 'q6'
  | 'q7'
  | 'q8'
  | 'q9'
  | 'q10'
  | 'q11'
  | 'q12'
  | 'q13'
  | 'q14'
  | 'q_dead';

export interface DfaStateMeta {
  id: DfaStateId;
  label: string;
  description: string;
  expectedInput: string;
  isStart: boolean;
  isAccepting: boolean;
  isTrap: boolean;
}

export interface DfaTransitionStep {
  index: number;
  char: string;
  fromState: DfaStateId;
  toState: DfaStateId;
  rule: string;
  validTransition: boolean;
}

export interface DfaValidationResult {
  input: string;
  valid: boolean;
  finalState: DfaStateId;
  isAcceptingState: boolean;
  steps: DfaTransitionStep[];
  rejectedAtIndex: number | null;
  reason: string;
}

export interface RegexValidationResult {
  input: string;
  valid: boolean;
  pattern: string;
  reason: string;
}

export interface CombinedIdValidationResult {
  input: string;
  valid: boolean;
  agreement: boolean;
  dfa: DfaValidationResult;
  regex: RegexValidationResult;
  explanation: string;
}

export const EQUIPMENT_ID_REGEX_SOURCE = '^LAB-[A-Z]{2}-[A-Z]{3}-[0-9]{3}$';
export const EQUIPMENT_ID_REGEX = /^LAB-[A-Z]{2}-[A-Z]{3}-[0-9]{3}$/;

export const DFA_STATES: DfaStateMeta[] = [
  { id: 'q0', label: 'q0 (Start)', description: 'Initial state before reading prefix', expectedInput: "'L'", isStart: true, isAccepting: false, isTrap: false },
  { id: 'q1', label: 'q1', description: "Read 'L'", expectedInput: "'A'", isStart: false, isAccepting: false, isTrap: false },
  { id: 'q2', label: 'q2', description: "Read 'LA'", expectedInput: "'B'", isStart: false, isAccepting: false, isTrap: false },
  { id: 'q3', label: 'q3', description: "Read 'LAB' prefix", expectedInput: "'-'", isStart: false, isAccepting: false, isTrap: false },
  { id: 'q4', label: 'q4', description: 'Ready for Zone char 1', expectedInput: '[A-Z]', isStart: false, isAccepting: false, isTrap: false },
  { id: 'q5', label: 'q5', description: 'Read Zone char 1', expectedInput: '[A-Z]', isStart: false, isAccepting: false, isTrap: false },
  { id: 'q6', label: 'q6', description: 'Zone complete (2 letters)', expectedInput: "'-'", isStart: false, isAccepting: false, isTrap: false },
  { id: 'q7', label: 'q7', description: 'Ready for Category char 1', expectedInput: '[A-Z]', isStart: false, isAccepting: false, isTrap: false },
  { id: 'q8', label: 'q8', description: 'Read Category char 1', expectedInput: '[A-Z]', isStart: false, isAccepting: false, isTrap: false },
  { id: 'q9', label: 'q9', description: 'Read Category char 2', expectedInput: '[A-Z]', isStart: false, isAccepting: false, isTrap: false },
  { id: 'q10', label: 'q10', description: 'Category complete (3 letters)', expectedInput: "'-'", isStart: false, isAccepting: false, isTrap: false },
  { id: 'q11', label: 'q11', description: 'Ready for Serial digit 1', expectedInput: '[0-9]', isStart: false, isAccepting: false, isTrap: false },
  { id: 'q12', label: 'q12', description: 'Read Serial digit 1', expectedInput: '[0-9]', isStart: false, isAccepting: false, isTrap: false },
  { id: 'q13', label: 'q13', description: 'Read Serial digit 2', expectedInput: '[0-9]', isStart: false, isAccepting: false, isTrap: false },
  { id: 'q14', label: 'q14 (Accept)', description: 'Valid Equipment ID accepted', expectedInput: 'End of string (EOF)', isStart: false, isAccepting: true, isTrap: false },
  { id: 'q_dead', label: 'q_dead (Trap)', description: 'Invalid transition trap state', expectedInput: 'None (Rejected)', isStart: false, isAccepting: false, isTrap: true },
];

const isUpperAZ = (ch: string): boolean => ch.length === 1 && ch >= 'A' && ch <= 'Z';
const isDigit09 = (ch: string): boolean => ch.length === 1 && ch >= '0' && ch <= '9';

/**
 * Deterministic transition function δ(state, char) -> { nextState, rule, valid }
 */
export function dfaTransition(
  state: DfaStateId,
  ch: string
): { nextState: DfaStateId; rule: string; valid: boolean } {
  switch (state) {
    case 'q0':
      return ch === 'L'
        ? { nextState: 'q1', rule: "δ(q0, 'L') → q1", valid: true }
        : { nextState: 'q_dead', rule: `δ(q0, '${ch}') → q_dead (expected 'L')`, valid: false };
    case 'q1':
      return ch === 'A'
        ? { nextState: 'q2', rule: "δ(q1, 'A') → q2", valid: true }
        : { nextState: 'q_dead', rule: `δ(q1, '${ch}') → q_dead (expected 'A')`, valid: false };
    case 'q2':
      return ch === 'B'
        ? { nextState: 'q3', rule: "δ(q2, 'B') → q3", valid: true }
        : { nextState: 'q_dead', rule: `δ(q2, '${ch}') → q_dead (expected 'B')`, valid: false };
    case 'q3':
      return ch === '-'
        ? { nextState: 'q4', rule: "δ(q3, '-') → q4", valid: true }
        : { nextState: 'q_dead', rule: `δ(q3, '${ch}') → q_dead (expected '-')`, valid: false };
    case 'q4':
      return isUpperAZ(ch)
        ? { nextState: 'q5', rule: `δ(q4, '${ch}' ∈ [A-Z]) → q5`, valid: true }
        : { nextState: 'q_dead', rule: `δ(q4, '${ch}') → q_dead (expected Zone uppercase [A-Z])`, valid: false };
    case 'q5':
      return isUpperAZ(ch)
        ? { nextState: 'q6', rule: `δ(q5, '${ch}' ∈ [A-Z]) → q6`, valid: true }
        : { nextState: 'q_dead', rule: `δ(q5, '${ch}') → q_dead (expected Zone uppercase [A-Z])`, valid: false };
    case 'q6':
      return ch === '-'
        ? { nextState: 'q7', rule: "δ(q6, '-') → q7", valid: true }
        : { nextState: 'q_dead', rule: `δ(q6, '${ch}') → q_dead (expected '-' after 2-letter Zone)`, valid: false };
    case 'q7':
      return isUpperAZ(ch)
        ? { nextState: 'q8', rule: `δ(q7, '${ch}' ∈ [A-Z]) → q8`, valid: true }
        : { nextState: 'q_dead', rule: `δ(q7, '${ch}') → q_dead (expected Category uppercase [A-Z])`, valid: false };
    case 'q8':
      return isUpperAZ(ch)
        ? { nextState: 'q9', rule: `δ(q8, '${ch}' ∈ [A-Z]) → q9`, valid: true }
        : { nextState: 'q_dead', rule: `δ(q8, '${ch}') → q_dead (expected Category uppercase [A-Z])`, valid: false };
    case 'q9':
      return isUpperAZ(ch)
        ? { nextState: 'q10', rule: `δ(q9, '${ch}' ∈ [A-Z]) → q10`, valid: true }
        : { nextState: 'q_dead', rule: `δ(q9, '${ch}') → q_dead (expected Category uppercase [A-Z])`, valid: false };
    case 'q10':
      return ch === '-'
        ? { nextState: 'q11', rule: "δ(q10, '-') → q11", valid: true }
        : { nextState: 'q_dead', rule: `δ(q10, '${ch}') → q_dead (expected '-' after 3-letter Category)`, valid: false };
    case 'q11':
      return isDigit09(ch)
        ? { nextState: 'q12', rule: `δ(q11, '${ch}' ∈ [0-9]) → q12`, valid: true }
        : { nextState: 'q_dead', rule: `δ(q11, '${ch}') → q_dead (expected Serial digit [0-9])`, valid: false };
    case 'q12':
      return isDigit09(ch)
        ? { nextState: 'q13', rule: `δ(q12, '${ch}' ∈ [0-9]) → q13`, valid: true }
        : { nextState: 'q_dead', rule: `δ(q12, '${ch}') → q_dead (expected Serial digit [0-9])`, valid: false };
    case 'q13':
      return isDigit09(ch)
        ? { nextState: 'q14', rule: `δ(q13, '${ch}' ∈ [0-9]) → q14 (ACCEPT)`, valid: true }
        : { nextState: 'q_dead', rule: `δ(q13, '${ch}') → q_dead (expected Serial digit [0-9])`, valid: false };
    case 'q14':
      return {
        nextState: 'q_dead',
        rule: `δ(q14, '${ch}') → q_dead (unexpected trailing character beyond 14 chars)`,
        valid: false,
      };
    case 'q_dead':
    default:
      return { nextState: 'q_dead', rule: `δ(q_dead, '${ch}') → q_dead (trap loop)`, valid: false };
  }
}

export function validateWithDFA(rawInput: string): DfaValidationResult {
  const input = rawInput ?? '';
  let currentState: DfaStateId = 'q0';
  const steps: DfaTransitionStep[] = [];
  let rejectedAtIndex: number | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const { nextState, rule, valid } = dfaTransition(currentState, ch);
    steps.push({
      index: i,
      char: ch,
      fromState: currentState,
      toState: nextState,
      rule,
      validTransition: valid,
    });
    if (!valid && rejectedAtIndex === null) {
      rejectedAtIndex = i;
    }
    currentState = nextState;
  }

  const isAccepting = currentState === 'q14';
  let reason = '';
  if (isAccepting) {
    reason = `Accepted: DFA traversed q0 → q14 across 14 characters matching LAB-<ZONE>-<CAT>-<NNN>.`;
  } else if (input.length === 0) {
    reason = `Rejected: empty string ended in start state q0 (expected 'L').`;
  } else if (currentState === 'q_dead' && rejectedAtIndex !== null) {
    const failingStep = steps[rejectedAtIndex];
    reason = `Rejected at index ${rejectedAtIndex} ('${failingStep.char}'): ${failingStep.rule}.`;
  } else {
    const meta = DFA_STATES.find((s) => s.id === currentState);
    reason = `Rejected: input ended prematurely in non-accepting state ${currentState} (expected ${meta?.expectedInput ?? 'more characters'}).`;
  }

  return {
    input,
    valid: isAccepting,
    finalState: currentState,
    isAcceptingState: isAccepting,
    steps,
    rejectedAtIndex,
    reason,
  };
}

export function validateWithRegex(rawInput: string): RegexValidationResult {
  const input = rawInput ?? '';
  const valid = EQUIPMENT_ID_REGEX.test(input);
  return {
    input,
    valid,
    pattern: EQUIPMENT_ID_REGEX_SOURCE,
    reason: valid
      ? `Matched regex ${EQUIPMENT_ID_REGEX_SOURCE}.`
      : `Did not match regex ${EQUIPMENT_ID_REGEX_SOURCE} (must be LAB-[A-Z]{2}-[A-Z]{3}-[0-9]{3}).`,
  };
}

export function validateEquipmentId(rawInput: string): CombinedIdValidationResult {
  const input = rawInput ?? '';
  const dfa = validateWithDFA(input);
  const regex = validateWithRegex(input);
  const agreement = dfa.valid === regex.valid;

  return {
    input,
    valid: dfa.valid && regex.valid,
    agreement,
    dfa,
    regex,
    explanation: dfa.valid
      ? `Both DFA (final state q14) and Regex (${EQUIPMENT_ID_REGEX_SOURCE}) accepted "${input}".`
      : `${dfa.reason} Regex check agrees: ${regex.valid ? 'match' : 'rejected'}.`,
  };
}

export const DFA_SAMPLE_CASES: Array<{ id: string; label: string; expectedValid: boolean }> = [
  { id: 'LAB-CH-SPK-042', label: 'Chemistry Spectrometer #042', expectedValid: true },
  { id: 'LAB-BI-PCR-108', label: 'Biology PCR Thermal Cycler #108', expectedValid: true },
  { id: 'LAB-EL-OSC-007', label: 'Electronics Oscilloscope #007', expectedValid: true },
  { id: 'LAB-CR-CRY-999', label: 'Cryogenics Vault Sensor #999', expectedValid: true },
  { id: 'LAB-ch-SPK-042', label: 'Lowercase zone code', expectedValid: false },
  { id: 'LAB-CH-SP-042', label: '2-letter category instead of 3', expectedValid: false },
  { id: 'LAB-CH-SPK-42', label: '2-digit serial instead of 3', expectedValid: false },
  { id: 'LAB-CH-SPK-0421', label: 'Extra trailing digit (15 chars)', expectedValid: false },
  { id: 'EQUIP-CH-SPK-042', label: 'Wrong prefix (EQUIP instead of LAB)', expectedValid: false },
];
