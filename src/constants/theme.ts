// SPENDY Design System — Theme Constants
// White background, black high-contrast text, rounded cards, muted grays

export const Colors = {
  // Backgrounds
  background: '#FFFFFF',
  backgroundSecondary: '#F5F5F7',
  backgroundCard: '#FFFFFF',
  backgroundMuted: '#F0F0F3',

  // Text
  textPrimary: '#0A0A0A',
  textSecondary: '#6B6B80',
  textMuted: '#A0A0B0',
  textInverse: '#FFFFFF',

  // Brand
  brand: '#1A1A2E',
  brandAccent: '#6C63FF',
  brandLight: '#EEF0FF',

  // Semantic
  success: '#22C55E',
  successLight: '#DCFCE7',
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  info: '#3B82F6',
  infoLight: '#DBEAFE',

  // Debit / Credit
  debit: '#EF4444',
  credit: '#22C55E',

  // Borders
  border: '#E5E5EA',
  borderLight: '#F0F0F5',

  // Chart colors
  chart: ['#6C63FF', '#22C55E', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#14B8A6', '#F97316'],

  // Shadows
  shadowColor: '#000000',
};

export const Typography = {
  fontFamily: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
  },
  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    hero: 48,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  section: 40,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
};
