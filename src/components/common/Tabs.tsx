interface Tab { id: string; label: string; count?: number }
interface Props { tabs: Tab[]; active: string; onChange: (id: string) => void }

export function Tabs({ tabs, active, onChange }: Props) {
  return (
    <div className="cx-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={active === t.id} className="cx-tab" onClick={() => onChange(t.id)}>
          {t.label}{t.count !== undefined && <span className="cx-tab__count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
