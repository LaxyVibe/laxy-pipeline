import { alpha, createTheme } from '@mui/material/styles';

export const audioDirectorTokens = {
  colors: {
    forest: '#1f5c4f',
    forestDark: '#17483d',
    forestSoft: '#5f9b8d',
    gold: '#c98b2c',
    goldSoft: '#f0c06d',
    ink: '#1f2b26',
    mutedInk: '#61706a',
    sand: '#f7f2e9',
    ivory: '#fffdf8',
    mist: '#f3f6f2',
    white: '#ffffff',
  },
  radius: {
    panel: 24,
    card: 18,
    pill: 999,
  },
  shadows: {
    card: '0 18px 42px rgba(96, 76, 40, 0.08)',
    hero: '0 24px 52px rgba(31, 92, 79, 0.18)',
  },
} as const;

export const audioDirectorTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: audioDirectorTokens.colors.forest,
      dark: audioDirectorTokens.colors.forestDark,
      light: audioDirectorTokens.colors.forestSoft,
      contrastText: audioDirectorTokens.colors.white,
    },
    secondary: {
      main: audioDirectorTokens.colors.gold,
      dark: '#9c6a1e',
      light: audioDirectorTokens.colors.goldSoft,
      contrastText: '#2f2411',
    },
    background: {
      default: audioDirectorTokens.colors.sand,
      paper: audioDirectorTokens.colors.ivory,
    },
    text: {
      primary: audioDirectorTokens.colors.ink,
      secondary: audioDirectorTokens.colors.mutedInk,
    },
    divider: alpha(audioDirectorTokens.colors.ink, 0.12),
  },
  shape: {
    borderRadius: audioDirectorTokens.radius.card,
  },
  typography: {
    fontFamily: '"Avenir Next", "SF Pro Display", "Segoe UI", sans-serif',
    h3: {
      fontWeight: 700,
      letterSpacing: '-0.03em',
    },
    h4: {
      fontWeight: 700,
      letterSpacing: '-0.03em',
    },
    h6: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    button: {
      textTransform: 'none',
      fontWeight: 700,
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: audioDirectorTokens.colors.ivory,
          border: `1px solid ${alpha(audioDirectorTokens.colors.ink, 0.08)}`,
          boxShadow: audioDirectorTokens.shadows.card,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          paddingInline: 18,
        },
        contained: {
          boxShadow: '0 10px 24px rgba(31, 92, 79, 0.20)',
        },
        outlined: {
          borderColor: alpha(audioDirectorTokens.colors.forest, 0.22),
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: audioDirectorTokens.radius.pill,
          fontWeight: 600,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#fffaf3',
          borderRadius: 18,
          '& fieldset': {
            borderColor: alpha(audioDirectorTokens.colors.ink, 0.16),
          },
          '&:hover fieldset': {
            borderColor: alpha(audioDirectorTokens.colors.forest, 0.32),
          },
          '&.Mui-focused fieldset': {
            borderColor: audioDirectorTokens.colors.forest,
            borderWidth: 1.5,
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: audioDirectorTokens.radius.panel,
          backgroundColor: audioDirectorTokens.colors.ivory,
        },
      },
    },
  },
});

export const audioDirectorStyles = {
  page: {
    minHeight: '100%',
    background: `
      radial-gradient(circle at top left, rgba(237, 214, 168, 0.42), transparent 26%),
      linear-gradient(180deg, #faf4ea 0%, #f7f2e9 45%, #f3f6f2 100%)
    `,
    py: { xs: 3, md: 4 },
  },
  hero: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 6,
    px: { xs: 3, md: 4 },
    py: { xs: 3, md: 4 },
    color: audioDirectorTokens.colors.white,
    background: `
      radial-gradient(circle at top right, rgba(240, 192, 109, 0.26), transparent 28%),
      linear-gradient(135deg, #17483d 0%, #1f5c4f 48%, #31594d 100%)
    `,
    border: `1px solid ${alpha(audioDirectorTokens.colors.white, 0.14)}`,
    boxShadow: audioDirectorTokens.shadows.hero,
  },
  heroMetric: {
    p: 2,
    borderRadius: 4,
    backgroundColor: alpha(audioDirectorTokens.colors.white, 0.10),
    border: `1px solid ${alpha(audioDirectorTokens.colors.white, 0.16)}`,
    backdropFilter: 'blur(16px)',
  },
  floatingNav: {
    borderRadius: audioDirectorTokens.radius.pill,
    px: 1.5,
    py: 0.75,
    bgcolor: alpha(audioDirectorTokens.colors.forest, 0.06),
    border: `1px solid ${alpha(audioDirectorTokens.colors.forest, 0.10)}`,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.5,
    flexWrap: 'wrap',
  },
  sectionCard: {
    borderRadius: 4,
  },
  nestedPanel: {
    p: 2,
    borderRadius: 4,
    border: `1px solid ${alpha(audioDirectorTokens.colors.ink, 0.08)}`,
    backgroundColor: alpha(audioDirectorTokens.colors.ivory, 0.92),
  },
  mutedPanel: {
    p: 2,
    borderRadius: 4,
    border: `1px solid ${alpha(audioDirectorTokens.colors.forest, 0.10)}`,
    backgroundColor: '#f9f4ea',
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: '14px',
    display: 'grid',
    placeItems: 'center',
    bgcolor: alpha(audioDirectorTokens.colors.forest, 0.10),
    color: audioDirectorTokens.colors.forestDark,
  },
} as const;

export function createSelectableCardSx(args: {
  selected?: boolean;
  recommended?: boolean;
  backgroundColor?: string;
} = {}) {
  const { selected = false, recommended = false, backgroundColor = audioDirectorTokens.colors.ivory } = args;
  return {
    p: 2,
    borderRadius: 3,
    cursor: 'pointer',
    border: '2px solid',
    borderColor: selected
      ? audioDirectorTokens.colors.forestDark
      : alpha(audioDirectorTokens.colors.forest, 0.10),
    borderLeft: recommended ? `4px solid ${audioDirectorTokens.colors.gold}` : undefined,
    bgcolor: selected
      ? alpha(audioDirectorTokens.colors.forest, 0.06)
      : backgroundColor,
    transition: 'border-color 0.15s, background-color 0.15s, transform 0.15s',
    '&:hover': {
      borderColor: selected
        ? audioDirectorTokens.colors.forestDark
        : alpha(audioDirectorTokens.colors.forest, 0.30),
      transform: 'translateY(-1px)',
    },
  };
}
