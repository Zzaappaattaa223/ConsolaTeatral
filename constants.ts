export const soundColors = {
  chakraRed: 'bg-red-600',
  transitionRedOrange: 'bg-orange-500',
  chakraOrange: 'bg-amber-500',
  transitionOrangeYellow: 'bg-yellow-400',
  chakraYellow: 'bg-lime-400',
  transitionYellowGreen: 'bg-green-500',
  chakraGreen: 'bg-emerald-500',
  transitionGreenBlue: 'bg-teal-500',
  chakraBlue: 'bg-cyan-500',
  transitionBlueIndigo: 'bg-sky-500',
  chakraIndigo: 'bg-indigo-600',
  transitionIndigoViolet: 'bg-purple-600',
  chakraViolet: 'bg-fuchsia-500',
  // New colors
  black: 'bg-gray-900',
  gray: 'bg-gray-500',
  white: 'bg-gray-200',
  // New special styles
  splitRedBlue: 'bg-gradient-to-br from-red-600 to-sky-500',
  splitGreenYellow: 'bg-gradient-to-br from-emerald-500 to-yellow-400',
  splitPurpleOrange: 'bg-gradient-to-br from-purple-600 to-orange-500',
  disabled: 'bg-gray-600',
};

export const soundGlowColors = {
    chakraRed: '#dc2626',
    transitionRedOrange: '#f97316',
    chakraOrange: '#f59e0b',
    transitionOrangeYellow: '#facc15',
    chakraYellow: '#a3e635',
    transitionYellowGreen: '#22c55e',
    chakraGreen: '#10b981',
    transitionGreenBlue: '#14b8a6',
    chakraBlue: '#06b6d4',
    transitionBlueIndigo: '#0ea5e9',
    chakraIndigo: '#4f46e5',
    transitionIndigoViolet: '#9333ea',
    chakraViolet: '#d946ef',
    // New colors
    black: '#374151',
    gray: '#6b7280',
    white: '#f9fafb',
    // New special styles
    splitRedBlue: '#ef4444',
    splitGreenYellow: '#10b981',
    splitPurpleOrange: '#9333ea',
    disabled: '#ef4444',
};

export const soundBorderColors = {
    chakraRed: 'border-red-400',
    transitionRedOrange: 'border-orange-400',
    chakraOrange: 'border-amber-400',
    transitionOrangeYellow: 'border-yellow-300',
    chakraYellow: 'border-lime-300',
    transitionYellowGreen: 'border-green-400',
    chakraGreen: 'border-emerald-400',
    transitionGreenBlue: 'border-teal-400',
    chakraBlue: 'border-cyan-400',
    transitionBlueIndigo: 'border-sky-400',
    chakraIndigo: 'border-indigo-400',

    transitionIndigoViolet: 'border-purple-400',
    chakraViolet: 'border-fuchsia-400',
    // New colors
    black: 'border-gray-700',
    gray: 'border-gray-400',
    white: 'border-gray-400',
    // New special styles
    splitRedBlue: 'border-red-400',
    splitGreenYellow: 'border-emerald-400',
    splitPurpleOrange: 'border-purple-400',
    disabled: 'border-gray-500',
};

export const colors = Object.keys(soundColors) as (keyof typeof soundColors)[];

export const DEFAULT_VOLUME = 0.75;
export const DEFAULT_PITCH = 1.0;
export const DEFAULT_PAN = 0;
export const DEFAULT_CROSSFADE = 0.5;

export const EQ_BANDS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_BAND_DEFAULTS = Array(10).fill(0);
export const PREAMP_DEFAULT = 0; // in dB