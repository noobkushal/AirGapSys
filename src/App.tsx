import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Loading } from './components/common';
import { ConsoleProvider } from './state/ConsoleContext';

const Landing = lazy(() => import('./landing/Landing'));
const Overview = lazy(() => import('./pages/Overview'));
const AgentPage = lazy(() => import('./pages/AgentPage'));
const SecurityMonitor = lazy(() => import('./pages/SecurityMonitor'));
const PromptInjection = lazy(() => import('./pages/PromptInjection'));
const Taint = lazy(() => import('./pages/Taint'));
const Policies = lazy(() => import('./pages/Policies'));
const ToolPermissions = lazy(() => import('./pages/ToolPermissions'));
const Approvals = lazy(() => import('./pages/Approvals'));
const AirGap = lazy(() => import('./pages/AirGap'));
const Rag = lazy(() => import('./pages/Rag'));
const LocalTools = lazy(() => import('./pages/LocalTools'));
const Ollama = lazy(() => import('./pages/Ollama'));
const Audit = lazy(() => import('./pages/Audit'));
const Integrity = lazy(() => import('./pages/Integrity'));
const Architecture = lazy(() => import('./pages/Architecture'));
const Health = lazy(() => import('./pages/Health'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

const fallback = <div className="cx-page"><div className="cx-page__inner"><Loading rows={3} height={110} /></div></div>;

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <ConsoleProvider>
        <Suspense fallback={fallback}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route element={<AppShell />}>
              <Route path="/overview" element={<Overview />} />
              <Route path="/agent" element={<AgentPage />} />
              <Route path="/security-monitor" element={<SecurityMonitor />} />
              <Route path="/prompt-injection" element={<PromptInjection />} />
              <Route path="/taint" element={<Taint />} />
              <Route path="/policies" element={<Policies />} />
              <Route path="/tool-permissions" element={<ToolPermissions />} />
              <Route path="/approvals" element={<Approvals />} />
              <Route path="/air-gap" element={<AirGap />} />
              <Route path="/rag" element={<Rag />} />
              <Route path="/local-tools" element={<LocalTools />} />
              <Route path="/ollama" element={<Ollama />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/integrity" element={<Integrity />} />
              <Route path="/architecture" element={<Architecture />} />
              <Route path="/health" element={<Health />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </ConsoleProvider>
    </BrowserRouter>
  );
}
