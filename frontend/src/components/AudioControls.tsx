import { useEffect, useState } from "react";

interface AudioControlsProps {
  text: string;
}

export function AudioControls({ text }: AudioControlsProps) {
  const [speaking, setSpeaking] = useState(false);
  const supportsSpeech =
    typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  function toggleNarration() {
    if (!supportsSpeech) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  return (
    <div className="audio-controls">
      <button
        className="secondary-action"
        type="button"
        onClick={toggleNarration}
        disabled={!supportsSpeech || !text}
      >
        {speaking ? "Stop reading" : "Read briefing aloud"}
      </button>
      <span role="status" aria-live="polite">
        {!supportsSpeech
          ? "Audio narration is not available in this browser. The full briefing is available as text."
          : speaking
            ? "Reading the briefing aloud."
            : "Optional audio; the same information is available in text."}
      </span>
    </div>
  );
}
