// Mirrors the web client's Tailwind theme (client/tailwind.config.js) so the
// app and website share one visual identity.
export const colors = {
  bg: '#0D0F14',
  surface: '#161A23',
  surface2: '#1E2330',
  border: '#2A3142',
  primary: '#6C63FF',
  primaryGlow: 'rgba(108,99,255,0.20)',
  accent: '#00D4AA',
  accentGlow: 'rgba(0,212,170,0.16)',
  text: '#E8EAF0',
  textMuted: '#7B8299',
  error: '#FF5370',
  success: '#00D4AA',
  white: '#FFFFFF',
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const font = {
  display: 'PlusJakartaSans_700Bold',
  displaySemi: 'PlusJakartaSans_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
};

// Safe fallbacks in case fonts fail to load (renders in system font).
export const fontFallback = {
  display: undefined,
  body: undefined,
};
