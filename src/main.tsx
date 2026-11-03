import { createRoot } from 'react-dom/client';
import App from './App';
import { preloadImages } from './assets/images';
import './index.css';

// la foto de familia tiene que estar lista antes de armar la casa (retratos y fotos tiradas)
void preloadImages().then(() => createRoot(document.getElementById('root')!).render(<App />));
