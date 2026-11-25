import {
  Contrast,
  Minus,
  Monitor,
  Moon,
  Plus,
  Settings2,
  Sun,
  Zap,
  ZapOff,
} from "lucide-react";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { PALETTES, type PaletteId } from "@/lib/palettes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEME_OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const TEXT_SCALE_STEP = 0.05;

/**
 * One place for every display preference: theme (light/dark/system), high
 * contrast, text scale and the reduced-motion override. Values persist through
 * `ThemeProvider`, so the choice survives a reload.
 */
export function DisplaySettings() {
  const {
    mode,
    palette,
    contrast,
    textScale,
    motion,
    resolvedTheme,
    setMode,
    setPalette,
    setContrast,
    setTextScale,
    setMotion,
  } = useTheme();

  const percentage = Math.round(textScale * 100);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Display settings"
          title="Display settings"
          className="gap-1.5"
        >
          <span
            aria-hidden="true"
            className="size-3 rounded-full border border-border bg-primary"
          />
          <Settings2 aria-hidden="true" size={18} strokeWidth={2} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => setMode(value as ThemeMode)}
        >
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon aria-hidden="true" size={16} strokeWidth={2} />
              <span>{label}</span>
              {value === "system" ? (
                <span className="ml-auto text-xs text-muted-foreground">
                  {resolvedTheme}
                </span>
              ) : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Colour theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={palette}
          onValueChange={(value) => setPalette(value as PaletteId)}
        >
          {PALETTES.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              <span
                aria-hidden="true"
                className="size-3.5 shrink-0 rounded-full border border-border"
                style={{ background: option.swatch }}
              />
              <span className="flex-1">{option.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={contrast === "high"}
          onCheckedChange={(checked) =>
            setContrast(checked ? "high" : "standard")
          }
        >
          <Contrast aria-hidden="true" size={16} strokeWidth={2} />
          <span>High contrast</span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={motion === "reduce"}
          onCheckedChange={(checked) =>
            setMotion(checked ? "reduce" : "system")
          }
        >
          {motion === "reduce" ? (
            <ZapOff aria-hidden="true" size={16} strokeWidth={2} />
          ) : (
            <Zap aria-hidden="true" size={16} strokeWidth={2} />
          )}
          <span>Reduce motion</span>
        </DropdownMenuCheckboxItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>
          <span className="flex items-center justify-between gap-2">
            <span>Text size</span>
            <span aria-live="polite" className="tabular-nums text-foreground">
              {percentage}%
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuItem
          disabled={textScale <= 0.9}
          aria-label={`Decrease text size, currently ${percentage}%`}
          onSelect={(event) => {
            event.preventDefault();
            setTextScale(textScale - TEXT_SCALE_STEP);
          }}
        >
          <Minus aria-hidden="true" size={16} strokeWidth={2} />
          <span>Smaller text</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={textScale >= 1.25}
          aria-label={`Increase text size, currently ${percentage}%`}
          onSelect={(event) => {
            event.preventDefault();
            setTextScale(textScale + TEXT_SCALE_STEP);
          }}
        >
          <Plus aria-hidden="true" size={16} strokeWidth={2} />
          <span>Larger text</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
