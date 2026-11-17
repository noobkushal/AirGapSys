/**
 * DEMO ONLY. A tiny keyword heuristic that lets the UI show how a verdict is rendered.
 * It is NOT a prompt-injection detector and must never be treated as a security control.
 * The real classifier belongs in the backend (see services/securityService.ts).
 */
import type { Classification, Decision, Risk, TrustLabel } from '../types';

export interface DemoVerdict {
  category: string;
  risk: number;
  decision: Decision;
  riskLabel: Risk;
  reason: string;
  matched: string[];
  trust: TrustLabel;
  classification: Classification;
}

const RULES: { re: RegExp; category: string; weight: number; reason: string }[] = [
  { re: /ignore (all )?(previous|prior|above) (instructions|constraints|rules)/i, category: 'Instruction Override', weight: 60, reason: 'Attempt to override system instructions.' },
  { re: /(curl|wget|http_post|fetch)\s+https?:\/\//i, category: 'Data Exfiltration', weight: 45, reason: 'References an outbound network call.' },
  { re: /\/etc\/(passwd|shadow)|\.env\b|id_rsa/i, category: 'Credential Access', weight: 40, reason: 'Targets credential or system files.' },
  { re: /(send|email|post|upload).{0,40}(to|at)\s+\S+@\S+|\bto example\.com|\bexfil/i, category: 'Data Exfiltration', weight: 45, reason: 'Asks to transmit data to an external destination.' },
  { re: /(confidential|secret|financial|restricted).{0,80}(send|post|upload|email|transmit)/i, category: 'Data Exfiltration', weight: 30, reason: 'Classified material combined with an outbound transfer request.' },
  { re: /(you are now|pretend to be|act as).{0,30}(dan|unrestricted|jailbroken|no rules)/i, category: 'Jailbreak Pattern', weight: 50, reason: 'Role-play override pattern.' },
  { re: /(reveal|print|show|repeat).{0,25}(system prompt|hidden instructions)/i, category: 'System Prompt Leak', weight: 45, reason: 'Attempts to extract the system prompt.' },
  { re: /<\/?(system|assistant)>|\[\/?INST\]/i, category: 'Delimiter Injection', weight: 35, reason: 'Contains chat-template delimiters.' },
];

export function demoClassify(input: string): DemoVerdict {
  const matched: string[] = [];
  let score = 4;
  let category = 'Benign request';
  let reason = 'No suspicious patterns matched by the demo heuristic.';
  let top = 0;
  for (const r of RULES) {
    if (r.re.test(input)) {
      matched.push(r.category);
      score += r.weight;
      if (r.weight > top) { top = r.weight; category = r.category; reason = r.reason; }
    }
  }
  const risk = Math.min(99, score);
  const decision: Decision = risk >= 60 ? 'BLOCK' : risk >= 35 ? 'REQUIRE_APPROVAL' : 'ALLOW';
  const riskLabel: Risk = risk >= 85 ? 'CRITICAL' : risk >= 60 ? 'HIGH' : risk >= 35 ? 'MEDIUM' : 'LOW';
  const classification: Classification = /confidential|financial|secret|\.pdf/i.test(input) ? 'CONFIDENTIAL' : 'INTERNAL';
  return { category, risk, decision, riskLabel, reason, matched, trust: 'USER', classification };
}
