import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

function Placeholder() {
  return <main className="flex-center full-screen-center">Zelos v2</main>;
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><Placeholder /></StrictMode>);
