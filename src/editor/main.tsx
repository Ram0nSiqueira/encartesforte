import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts';
import './editor.css';
import './flyer.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
