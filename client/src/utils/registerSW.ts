/**
 * Register Service Worker for PWA functionality
 */
export const registerSW = (): void => {
  if (!import.meta.env.PROD) {
    return;
  }

  if ('serviceWorker' in navigator) {
    // Unregister stale legacy service workers
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });

    if ('caches' in window) {
      caches.keys().then((names) => {
        for (const name of names) {
          if (name.includes('workbox') || name.includes('sw')) {
            caches.delete(name);
          }
        }
      });
    }
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
