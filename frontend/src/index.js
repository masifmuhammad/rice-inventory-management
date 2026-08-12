import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initTheme } from './context/ThemeContext';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

initTheme();

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Never register a service worker during `npm start` — it caches /api and
// breaks login after Docker rebuilds. Production Docker builds still register.
if (process.env.NODE_ENV === 'production') {
  serviceWorkerRegistration.register();
} else {
  serviceWorkerRegistration.unregister();
}
