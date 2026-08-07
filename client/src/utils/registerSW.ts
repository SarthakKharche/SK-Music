import { Workbox } from 'workbox-window';

/**
 * Register Service Worker for PWA functionality
 */
export const registerSW = (): void => {
  if (!import.meta.env.PROD) {
    return;
  }

  if ('serviceWorker' in navigator) {
    const wb = new Workbox('/sw.js');

    wb.addEventListener('installed', (event) => {
      if (event.isUpdate) {
        console.log('New version installed, reloading...');
        window.location.reload();
      } else {
        console.log('Service Worker installed for the first time.');
      }
    });

    wb.addEventListener('waiting', () => {
      wb.messageSkipWaiting();
    });

    wb.register()
      .then((reg) => {
        console.log('Service Worker registered successfully.');
        if (reg) {
          reg.update();
        }
      })
      .catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
  }
};

/**
 * Check if app is running in standalone mode (installed PWA)
 */
export const isStandalone = (): boolean => {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
};

/**
 * Check if device is online
 */
export const isOnline = (): boolean => {
  return navigator.onLine;
};

/**
 * Listen for online/offline events
 */
export const addNetworkListeners = (
  onOnline: () => void,
  onOffline: () => void
): (() => void) => {
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
};
