import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './style.css';
// M35 6/N — o sistema visual vem DEPOIS: os tokens e as regras de componente dele vencem.
import './theme.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('elemento #root não encontrado em index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
