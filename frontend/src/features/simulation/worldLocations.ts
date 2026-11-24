export type LocationId =
  | "reservoir"
  | "main-pipe"
  | "homes"
  | "school"
  | "clinic"
  | "farms";

export interface WorldLocation {
  id: LocationId;
  label: string;
  x: number;
  y: number;
  color: number;
  sector?: "households" | "school" | "clinic" | "farms";
}

export const WORLD_LOCATIONS: WorldLocation[] = [
  {
    id: "reservoir",
    label: "Reservoir",
    x: 138,
    y: 134,
    color: 0x327f9b,
  },
  {
    id: "main-pipe",
    label: "Main pipe",
    x: 315,
    y: 218,
    color: 0xb8764c,
  },
  {
    id: "homes",
    label: "Homes",
    x: 477,
    y: 120,
    color: 0xd79c58,
    sector: "households",
  },
  {
    id: "school",
    label: "School",
    x: 664,
    y: 150,
    color: 0x786ba3,
    sector: "school",
  },
  {
    id: "clinic",
    label: "Clinic",
    x: 492,
    y: 302,
    color: 0xb95e3e,
    sector: "clinic",
  },
  {
    id: "farms",
    label: "Farms",
    x: 700,
    y: 317,
    color: 0x668b4f,
    sector: "farms",
  },
];
