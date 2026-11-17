import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts (no Google Fonts request: required for an air-gapped host).
import '@fontsource/sofia-sans/300.css';
import '@fontsource/sofia-sans/400.css';
import '@fontsource/sofia-sans/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/jetbrains-mono/800.css';
import './styles/tokens.css';
import './styles/global.css';
import './styles/ds.css';
import './styles/pages.css';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');
createRoot(root).render(<StrictMode><App /></StrictMode>);
