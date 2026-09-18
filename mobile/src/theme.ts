/** Shared design tokens, so screens stop hard-coding stray colours and spacing. */
export const colors = {
  brand: '#25D366',
  brandDark: '#128C42',
  brandSoft: '#E8F9EF',
  text: '#11181C',
  textMuted: '#5B6B73',
  textFaint: '#8A9AA3',
  border: '#DCE4E8',
  borderStrong: '#C3D0D6',
  background: '#F6F8F9',
  surface: '#FFFFFF',
  danger: '#D93025',
  dangerSoft: '#FDECEA',
  warning: '#B26A00',
  warningSoft: '#FFF4E5',
  success: '#1B7F4B',
  successSoft: '#E7F6EE',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const font = { title: 28, heading: 20, body: 15, label: 13, small: 12 } as const;
