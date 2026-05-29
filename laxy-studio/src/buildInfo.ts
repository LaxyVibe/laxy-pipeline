export const appBuildVersion = __APP_BUILD_VERSION__;
export const appBuildEnvironment = __APP_BUILD_ENVIRONMENT__;

export function formatBuildEnvironment(value: string): string {
  const normalized = value.trim();
  if (!normalized) return 'unknown';

  return normalized.toUpperCase();
}

export function formatBuildVersion(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date);
}
