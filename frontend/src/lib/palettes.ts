/**
 * The six selectable visual themes. IDs are persisted in localStorage and
 * mirrored by `[data-palette="…"]` blocks in styles/index.css. Swatch colours
 * are for the picker only; every surface colour comes from CSS variables.
 */
export const PALETTE_IDS = [
  "mtoni",
  "ocean",
  "savanna",
  "terracotta",
  "jacaranda",
  "contrast",
] as const;

export type PaletteId = (typeof PALETTE_IDS)[number];

export interface PaletteOption {
  id: PaletteId;
  label: string;
  description: string;
  swatch: string;
}

export const PALETTES: PaletteOption[] = [
  {
    id: "mtoni",
    label: "Mtoni Green",
    description: "Calm, nature-inspired default",
    swatch: "#176f5d",
  },
  {
    id: "ocean",
    label: "Ocean Blue",
    description: "Cool blues and teals",
    swatch: "#15608f",
  },
  {
    id: "savanna",
    label: "Savanna Gold",
    description: "Warm gold and sand",
    swatch: "#8a5a08",
  },
  {
    id: "terracotta",
    label: "Terracotta",
    description: "Clay, rust and cream",
    swatch: "#a2482d",
  },
  {
    id: "jacaranda",
    label: "Jacaranda",
    description: "Violet and soft neutrals",
    swatch: "#6541a6",
  },
  {
    id: "contrast",
    label: "High Contrast",
    description: "Strong contrast and distinct states",
    swatch: "#00513f",
  },
];

export function isPaletteId(value: unknown): value is PaletteId {
  return PALETTE_IDS.includes(value as PaletteId);
}

export function paletteLabel(id: PaletteId): string {
  return PALETTES.find((option) => option.id === id)?.label ?? id;
}
