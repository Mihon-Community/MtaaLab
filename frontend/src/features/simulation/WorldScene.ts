import Phaser from "phaser";
import { WORLD_LOCATIONS, type LocationId } from "./worldLocations";

export class WorldScene extends Phaser.Scene {
  private readonly onSelect: (location: LocationId) => void;
  private readonly markers = new Map<LocationId, Phaser.GameObjects.Arc>();

  constructor(onSelect: (location: LocationId) => void) {
    super({ key: "MtoniWorld" });
    this.onSelect = onSelect;
  }

  create() {
    this.drawLandscape();
    this.drawWaterNetwork();
    this.drawLocations();
  }

  private drawLandscape() {
    this.add.rectangle(430, 220, 860, 440, 0xe9efdf);

    const fields = this.add.graphics();
    fields.fillStyle(0xd8e4ca, 1);
    fields.fillPoints(
      [
        new Phaser.Geom.Point(560, 260),
        new Phaser.Geom.Point(835, 238),
        new Phaser.Geom.Point(840, 408),
        new Phaser.Geom.Point(606, 405),
      ],
      true,
    );
    fields.fillStyle(0xd3e0c3, 1);
    fields.fillPoints(
      [
        new Phaser.Geom.Point(340, 20),
        new Phaser.Geom.Point(835, 20),
        new Phaser.Geom.Point(835, 80),
        new Phaser.Geom.Point(400, 100),
      ],
      true,
    );

    const river = this.add.graphics();
    river.fillStyle(0x9fc8bd, 1);
    river.fillPoints(
      [
        new Phaser.Geom.Point(0, 326),
        new Phaser.Geom.Point(140, 280),
        new Phaser.Geom.Point(304, 318),
        new Phaser.Geom.Point(446, 284),
        new Phaser.Geom.Point(600, 324),
        new Phaser.Geom.Point(860, 278),
        new Phaser.Geom.Point(860, 352),
        new Phaser.Geom.Point(622, 395),
        new Phaser.Geom.Point(450, 354),
        new Phaser.Geom.Point(306, 386),
        new Phaser.Geom.Point(132, 346),
        new Phaser.Geom.Point(0, 376),
      ],
      true,
    );

    this.add.text(28, 24, "MTONI CATCHMENT", {
      color: "#597168",
      fontFamily: "Arial, sans-serif",
      fontSize: "13px",
      fontStyle: "bold",
      letterSpacing: 2,
    });
    this.add.text(28, 44, "Select a place to inspect", {
      color: "#71837a",
      fontFamily: "Arial, sans-serif",
      fontSize: "12px",
    });
  }

  private drawWaterNetwork() {
    const routes = this.add.graphics();
    routes.lineStyle(5, 0xf8f8ed, 0.9);
    routes.beginPath();
    routes.moveTo(138, 134);
    routes.lineTo(315, 218);
    routes.lineTo(477, 120);
    routes.moveTo(315, 218);
    routes.lineTo(664, 150);
    routes.moveTo(315, 218);
    routes.lineTo(492, 302);
    routes.moveTo(315, 218);
    routes.lineTo(700, 317);
    routes.strokePath();

    routes.lineStyle(2, 0x91aa9c, 0.9);
    routes.beginPath();
    routes.moveTo(138, 134);
    routes.lineTo(315, 218);
    routes.lineTo(477, 120);
    routes.moveTo(315, 218);
    routes.lineTo(664, 150);
    routes.moveTo(315, 218);
    routes.lineTo(492, 302);
    routes.moveTo(315, 218);
    routes.lineTo(700, 317);
    routes.strokePath();
  }

  private drawLocations() {
    for (const location of WORLD_LOCATIONS) {
      const marker = this.add
        .circle(location.x, location.y, 26, 0xffffff, 0.96)
        .setStrokeStyle(3, location.color, 1);
      this.markers.set(location.id, marker);
      this.drawStructure(location);

      this.add
        .text(location.x, location.y + 38, location.label, {
          color: "#26463d",
          backgroundColor: "#fffefa",
          fontFamily: "Arial, sans-serif",
          fontSize: "12px",
          fontStyle: "bold",
          padding: { x: 7, y: 4 },
        })
        .setOrigin(0.5);

      this.add
        .zone(location.x, location.y, 100, 82)
        .setInteractive(
          new Phaser.Geom.Rectangle(-50, -41, 100, 82),
          Phaser.Geom.Rectangle.Contains,
        )
        .on("pointerdown", () => this.selectLocation(location.id));
    }
  }

  private drawStructure(location: (typeof WORLD_LOCATIONS)[number]) {
    const graphics = this.add.graphics();
    const x = location.x;
    const y = location.y - 15;

    if (location.id === "reservoir") {
      graphics.fillStyle(0x497f8c, 1);
      graphics.fillRect(x - 25, y - 1, 50, 29);
      graphics.fillStyle(0x78b3b0, 1);
      graphics.fillEllipse(x, y - 1, 50, 20);
      graphics.fillStyle(0x327f9b, 1);
      graphics.fillEllipse(x, y + 27, 50, 18);
      graphics.fillStyle(0xd4e4d7, 0.8);
      graphics.fillRect(x + 13, y + 3, 3, 20);
      return;
    }

    if (location.id === "main-pipe") {
      graphics.fillStyle(0x997454, 1);
      graphics.fillRoundedRect(x - 35, y - 5, 70, 13, 6);
      graphics.fillStyle(0xd4c0a3, 1);
      graphics.fillRoundedRect(x - 25, y - 2, 50, 5, 2);
      graphics.fillStyle(0x997454, 1);
      graphics.fillRect(x - 24, y - 13, 7, 14);
      graphics.fillRect(x + 17, y - 13, 7, 14);
      return;
    }

    if (location.id === "farms") {
      graphics.fillStyle(0x8caa6b, 1);
      graphics.fillPoints(
        [
          new Phaser.Geom.Point(x, y - 24),
          new Phaser.Geom.Point(x + 36, y - 8),
          new Phaser.Geom.Point(x, y + 9),
          new Phaser.Geom.Point(x - 36, y - 8),
        ],
        true,
      );
      graphics.lineStyle(2, 0xe7dcb0, 0.9);
      graphics.beginPath();
      graphics.moveTo(x - 23, y - 6);
      graphics.lineTo(x + 11, y - 20);
      graphics.moveTo(x - 12, y + 1);
      graphics.lineTo(x + 22, y - 13);
      graphics.strokePath();
      return;
    }

    graphics.fillStyle(0xd6ddca, 1);
    graphics.fillPoints(
      [
        new Phaser.Geom.Point(x, y - 30),
        new Phaser.Geom.Point(x + 29, y - 15),
        new Phaser.Geom.Point(x, y),
        new Phaser.Geom.Point(x - 29, y - 15),
      ],
      true,
    );
    graphics.fillStyle(location.color, 1);
    graphics.fillPoints(
      [
        new Phaser.Geom.Point(x - 29, y - 15),
        new Phaser.Geom.Point(x, y),
        new Phaser.Geom.Point(x, y + 20),
        new Phaser.Geom.Point(x - 29, y + 5),
      ],
      true,
    );
    graphics.fillStyle(0x855b49, 1);
    graphics.fillPoints(
      [
        new Phaser.Geom.Point(x, y),
        new Phaser.Geom.Point(x + 29, y - 15),
        new Phaser.Geom.Point(x + 29, y + 5),
        new Phaser.Geom.Point(x, y + 20),
      ],
      true,
    );
    graphics.fillStyle(0xf4ead5, 1);
    graphics.fillPoints(
      [
        new Phaser.Geom.Point(x, y - 30),
        new Phaser.Geom.Point(x + 29, y - 15),
        new Phaser.Geom.Point(x, y),
        new Phaser.Geom.Point(x - 29, y - 15),
      ],
      true,
    );
    graphics.fillStyle(location.color, 1);
    graphics.fillPoints(
      [
        new Phaser.Geom.Point(x, y - 26),
        new Phaser.Geom.Point(x + 22, y - 15),
        new Phaser.Geom.Point(x, y - 4),
        new Phaser.Geom.Point(x - 22, y - 15),
      ],
      true,
    );
    graphics.fillStyle(0xfffefa, 1);
    graphics.fillRect(x - 18, y - 5, 5, 5);
    graphics.fillRect(x + 10, y - 5, 5, 5);
  }

  private selectLocation(locationId: LocationId) {
    for (const location of WORLD_LOCATIONS) {
      this.markers
        .get(location.id)
        ?.setFillStyle(location.id === locationId ? 0xd5ef91 : 0xffffff, 0.96);
    }
    this.onSelect(locationId);
  }
}
