import type { Classification, Decision, Risk, Tone, TrustLabel } from '../types';

export const riskTone = (r: Risk): Tone => ({ LOW: 'green', MEDIUM: 'amber', HIGH: 'orange', CRITICAL: 'red' } as const)[r];
export const decisionTone = (d: Decision): Tone => ({ ALLOW: 'green', BLOCK: 'red', REQUIRE_APPROVAL: 'green' } as const)[d];
export const classTone = (c: Classification): Tone => ({ PUBLIC: 'blue', INTERNAL: 'blue', CONFIDENTIAL: 'amber', RESTRICTED: 'red' } as const)[c];
export const trustTone = (t: TrustLabel): Tone => ({ SYSTEM: 'violet', LOCAL_DOCUMENT: 'green', RETRIEVED_DATA: 'green', USER: 'blue', TOOL_OUTPUT: 'violet', UNTRUSTED: 'red' } as const)[t];
