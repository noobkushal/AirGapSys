import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import type { Classification, Decision, Risk, Tone, TrustLabel } from '../../types';
import { classTone, decisionTone, riskTone, trustTone } from '../../utils/tones';
import { cx } from '../../utils/format';

interface PillProps { tone?: Tone; dot?: boolean; large?: boolean; children: ReactNode; title?: string }

export function Pill({ tone = 'blue', dot, large, children, title }: PillProps) {
  return <span title={title} className={cx('cx-pill', tone !== 'blue' && `cx-pill--${tone}`, dot && 'cx-pill--dot', large && 'cx-pill--lg')}>{children}</span>;
}
export const RiskPill = ({ risk }: { risk: Risk }) => <Pill tone={riskTone(risk)} dot>{risk}</Pill>;
export const DecisionPill = ({ decision }: { decision: Decision }) => {
  const tone: Tone = decision === 'REQUIRE_APPROVAL' ? 'green' : decisionTone(decision);
  return <Pill tone={tone}>{decision}</Pill>;
};
export const ClassPill = ({ value }: { value: Classification }) => <Pill tone={classTone(value)}><Lock aria-hidden />{value}</Pill>;
export const TrustPill = ({ value }: { value: TrustLabel }) => <Pill tone={trustTone(value)}>{value}</Pill>;
