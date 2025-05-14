export function getVersion(): string {
  return import.meta.env.VITE_VERSION ?? '0.0.0';
}
