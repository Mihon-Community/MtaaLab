import type { ButtonHTMLAttributes } from "react";

export function AccessibleButton(
  props: ButtonHTMLAttributes<HTMLButtonElement>,
) {
  return <button {...props} />;
}
