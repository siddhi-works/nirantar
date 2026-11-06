import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans-devanagari/400.css';
import '@fontsource/ibm-plex-sans-devanagari/600.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/features.css';
import './app.css';
import './styles/shell.css';
import App from './App';
import { installPageTranslation } from './i18n/page';

installPageTranslation();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
