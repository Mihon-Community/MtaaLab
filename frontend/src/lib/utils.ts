import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names and de-duplicate conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * The database stores grade bands as either "7" or "Grade 7"; render the full
 * label exactly once.
 */
export function formatGradeBand(value: string): string {
  const trimmed = value.trim();
  return /^grade\b/i.test(trimmed) ? trimmed : `Grade ${trimmed}`;
}
