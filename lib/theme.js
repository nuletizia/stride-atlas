// Theme tokens + workout type colors. Five stylistic variants.

export const palettes = {
  editorial: {
    bg: '#F4F1EA', bgRaised: '#FBF9F4', bgSunken: '#ECE7DC',
    ink: '#1A1A17', inkSoft: '#4A4842', inkMuted: '#8A867C',
    rule: '#D9D3C4', ruleSoft: '#E8E2D2',
    accent: '#C4502A', positive: '#4A7A4A', focus: '#1A1A17',
  },
  editorial_dark: {
    bg: '#141312', bgRaised: '#1C1B19', bgSunken: '#0E0D0C',
    ink: '#F2EEE4', inkSoft: '#B8B3A5', inkMuted: '#706C62',
    rule: '#2A2824', ruleSoft: '#1F1E1B',
    accent: '#E07A4A', positive: '#8FB890', focus: '#F2EEE4',
  },
  telemetry: {
    bg: '#0A0C10', bgRaised: '#0E1117', bgSunken: '#06080B',
    ink: '#E8FF66', inkSoft: '#BBC2CE', inkMuted: '#5A6472',
    rule: '#1A1F2A', ruleSoft: '#12161E',
    accent: '#FF3B9A', positive: '#00E5B8', focus: '#E8FF66',
  },
  fieldbook: {
    bg: '#EEE6D3', bgRaised: '#F5EEDC', bgSunken: '#E3DAC3',
    ink: '#2A221A', inkSoft: '#5E4E3A', inkMuted: '#9C8A6E',
    rule: '#C7B898', ruleSoft: '#D9CDB0',
    accent: '#B84A1E', positive: '#5E7A3A', focus: '#2A221A',
  },
  dataart: {
    bg: '#0E0E14', bgRaised: '#14141C', bgSunken: '#08080E',
    ink: '#F4EFE2', inkSoft: '#A8A394', inkMuted: '#5C5A52',
    rule: '#242430', ruleSoft: '#191923',
    accent: '#E8B04E', positive: '#7AC9A8', focus: '#F4EFE2',
  },
};

export const typeColors = {
  editorial: {
    easy: '#7A9A6E', tempo: '#D39B3F', long: '#C4502A',
    intervals: '#C94A5A', race: '#8B3A7A', recovery: '#6E8A9A',
  },
  editorial_dark: {
    easy: '#9DBE92', tempo: '#F0B85A', long: '#E8734A',
    intervals: '#E96A7A', race: '#C76AB5', recovery: '#8FAEC0',
  },
  telemetry: {
    easy: '#00E5B8', tempo: '#FFD23F', long: '#FF6A3B',
    intervals: '#FF3B9A', race: '#C17AFF', recovery: '#4EB4FF',
  },
  fieldbook: {
    easy: '#6F8B4A', tempo: '#BC8A3A', long: '#B84A1E',
    intervals: '#A63355', race: '#5C3A7A', recovery: '#4A6A8A',
  },
  dataart: {
    easy: '#7AC9A8', tempo: '#E8B04E', long: '#E46A4A',
    intervals: '#E04F7A', race: '#B978E8', recovery: '#5DB0E8',
  },
};

export function applyTheme(style) {
  if (typeof document === 'undefined') return;
  const key = palettes[style] ? style : 'editorial';
  const p = palettes[key];
  const t = typeColors[key];
  const root = document.documentElement;
  Object.entries(p).forEach(([k, v]) => root.style.setProperty('--' + k, v));
  Object.entries(t).forEach(([k, v]) => root.style.setProperty('--type-' + k, v));
  root.setAttribute('data-theme', key);
  root.setAttribute('data-style', key);
}
