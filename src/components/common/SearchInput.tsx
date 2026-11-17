import { Search } from 'lucide-react';

interface Props { value: string; onChange: (v: string) => void; placeholder: string; label?: string }

export function SearchInput({ value, onChange, placeholder, label = 'Search' }: Props) {
  return (
    <div className="cx-search">
      <Search aria-hidden />
      <input className="cx-input" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} />
    </div>
  );
}
