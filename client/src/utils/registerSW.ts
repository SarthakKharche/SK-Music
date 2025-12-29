import { Workbox } from 'workbox-window';

/**
 * Register Service Worker for PWA functionality
 */
export const registerSW = (): void => {
  if ('serviceWorker' in navigator) {
    const wb = new Workbox('/sw.js');

    wb.addEventListener('installed', (event) => {
      if (event.isUpdate) {
        console.log('New content available, please refresh.');
        // Show update notification to user
        if (confirm('New version available! Reload to update?')) {
          window.location.reload();
        }
      } else {
        console.log('Service Worker installed for the first time.');
      }
    });

    wb.addEventListener('activated', (event) => {
      if (!event.isUpdate) {
        console.log('Service Worker activated.');
      }
    });

    wb.register()
      .then(() => {
        console.log('Service Worker registered successfully.');
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
