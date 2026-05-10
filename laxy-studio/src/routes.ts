export const ROUTES = {
  root: '/',
  login: '/login',
  logout: '/logout',
  dashboard: '/dashboard',
  audioMvp: '/audio-mvp',
  audioMvp2: '/audio-mvp2',
  audioDirector: '/audio-director',
  tts: '/tts',
  debug: '/debug',
  admin: '/admin',
  adminWildcard: '/admin/*',
  adminCollection: '/admin/c',
  guides: '/guides',
  guide: '/guides/:id',
  guideStep: '/guides/:id/:step',
  wizard: '/wizard',
  wizardStep: '/wizard/:step',
} as const;

export function guidePath(id: string, step?: string): string {
  const base = `${ROUTES.guides}/${encodeURIComponent(id)}`;
  return step ? `${base}/${encodeURIComponent(step)}` : base;
}
