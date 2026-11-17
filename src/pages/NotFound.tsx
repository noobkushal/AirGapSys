import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Card, Page, PageHeader } from '../components/common';

export default function NotFound() {
  return (
    <Page>
      <PageHeader icon={<Compass color="#2563ff" />} title="Page not found" subtitle="That route does not exist in the Clarix console." />
      <Card><p className="cx-sub">Use the Clarix logo (top left) to open the navigation drawer, or <Link to="/overview" style={{ color: '#2563ff', fontWeight: 700 }}>return to the Overview</Link>.</p></Card>
    </Page>
  );
}
