import {previewUuid} from './src/lib/preview-uuid';

// Managed preview uses HTTP. Keep native HTTPS/production behavior untouched.
if (process.env.NODE_ENV === 'development' && window.location.hostname === 'terminal.local'
    && typeof crypto.randomUUID !== 'function' && typeof crypto.getRandomValues === 'function') {
  Object.defineProperty(crypto, 'randomUUID', {value: () => previewUuid(crypto), configurable: true});
}
