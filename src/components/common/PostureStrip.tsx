import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props { subtitle?: string; blocked?: number; onlyBlockedLabel?: string }

/** "Live security posture" strip shown on several references. Figures are simulated. */
export function PostureStrip({ subtitle = 'AIR-GAPPED • ZERO TRUST', blocked = 7 }: Props) {
  const nav = useNavigate();
  const items = [
    { big: '100%', label: 'isolated', note: 'Outbound traffic blocked', to: '/air-gap' },
    { big: '5 / 5', label: 'policy gates active', note: 'All enforcement rules enabled', to: '/policies' },
    { big: String(blocked).padStart(2, '0'), label: 'threats blocked', note: 'Simulated detections', to: '/prompt-injection' },
  ];
  return (
    <section className="cx-card cx-posture" aria-label="Live security posture (simulated)">
      <div className="cx-posture__lead"><h2>Live security posture</h2><span>{subtitle}</span></div>
      {items.map((i) => (
        <div className="cx-posture__item" key={i.label}>
          <strong>{i.big}</strong>
          <b>{i.label}</b>
          <small>{i.note}</small>
          <button type="button" className="cx-posture__go" aria-label={`Open ${i.label}`} onClick={() => nav(i.to)}><ArrowRight /></button>
        </div>
      ))}
    </section>
  );
}
