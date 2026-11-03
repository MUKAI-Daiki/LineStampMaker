export function isLocalDev(): boolean {
  if (import.meta.env.DEV) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
}
