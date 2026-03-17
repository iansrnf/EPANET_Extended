import { Position } from "geojson";
import { IdGenerator } from "src/lib/id-generator";
import { roundCoordinates } from "src/lib/geometry";
import { PressureLogger } from "src/hydraulic-model/pressure-loggers";

export class PressureLoggerFactory {
  private idGenerator: IdGenerator;

  constructor(idGenerator: IdGenerator) {
    this.idGenerator = idGenerator;
  }

  create(coordinates: Position, label?: string): PressureLogger {
    const id = this.idGenerator.newId();
    return new PressureLogger(id, roundCoordinates(coordinates), {
      label: label ?? `L${id}`,
    });
  }

  get totalGenerated(): number {
    return this.idGenerator.totalGenerated;
  }
}
