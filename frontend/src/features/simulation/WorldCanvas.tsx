import { useEffect, useRef, useState } from "react";
import type Phaser from "phaser";
import type { LocationId } from "./worldLocations";

interface WorldCanvasProps {
  onSelect: (location: LocationId) => void;
}

export function WorldCanvas({ onSelect }: WorldCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const [sceneError, setSceneError] = useState(false);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let active = true;
    let game: Phaser.Game | null = null;
    void Promise.all([import("phaser"), import("./WorldScene")])
      .then(([phaserModule, { WorldScene }]) => {
        if (!active || !mountRef.current) return;
        const Phaser = phaserModule.default;
        game = new Phaser.Game({
          type: Phaser.CANVAS,
          parent: mountRef.current,
          backgroundColor: "#e9efdf",
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: 860,
            height: 440,
          },
          scene: new WorldScene((location) => onSelectRef.current(location)),
          render: {
            antialias: true,
            pixelArt: false,
          },
          banner: false,
        });
        game.canvas.setAttribute("aria-hidden", "true");
      })
      .catch((error: unknown) => {
        if (active) {
          console.error("Could not initialize the Mtoni map renderer.", error);
          setSceneError(true);
        }
      });

    return () => {
      active = false;
      game?.destroy(true);
    };
  }, []);

  return (
    <div className="world-canvas-frame">
      <div
        ref={mountRef}
        className="world-canvas"
        role="img"
        aria-label="Illustrated map of Mtoni showing a reservoir, main pipe, homes, school, clinic and farms."
      />
      {sceneError && (
        <p className="map-render-error" role="status">
          The illustrated map could not load. Use the accessible location list
          below.
        </p>
      )}
      <p className="world-map-caption">
        A simplified model of Mtoni. Select a location here or use the
        accessible location list below.
      </p>
    </div>
  );
}
