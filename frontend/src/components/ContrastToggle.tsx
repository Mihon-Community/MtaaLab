import { useState } from "react";

export function ContrastToggle() {
  const [highContrast, setHighContrast] = useState(false);
  const [textScale, setTextScale] = useState(1);

  function updateContrast(enabled: boolean) {
    setHighContrast(enabled);
    document.documentElement.dataset.contrast = enabled ? "high" : "standard";
  }

  function updateTextScale(nextScale: number) {
    const boundedScale = Math.min(1.25, Math.max(0.9, nextScale));
    setTextScale(boundedScale);
    document.documentElement.style.setProperty(
      "--text-scale",
      String(boundedScale),
    );
  }

  return (
    <div className="accessibility-toolbar" aria-label="Display preferences">
      <button
        className="display-setting"
        type="button"
        aria-pressed={highContrast}
        onClick={() => updateContrast(!highContrast)}
      >
        {highContrast ? "Standard contrast" : "High contrast"}
      </button>
      <div className="text-size-controls" aria-label="Text size">
        <button
          className="display-setting text-size-button"
          type="button"
          aria-label="Decrease text size"
          onClick={() => updateTextScale(textScale - 0.05)}
          disabled={textScale <= 0.9}
        >
          A−
        </button>
        <span aria-live="polite">{Math.round(textScale * 100)}%</span>
        <button
          className="display-setting text-size-button"
          type="button"
          aria-label="Increase text size"
          onClick={() => updateTextScale(textScale + 0.05)}
          disabled={textScale >= 1.25}
        >
          A+
        </button>
      </div>
    </div>
  );
}
