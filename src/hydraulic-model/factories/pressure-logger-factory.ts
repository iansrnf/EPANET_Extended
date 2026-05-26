import { Position } from "src/types";
import { IdGenerator } from "src/lib/id-generator";
import { roundCoordinates } from "src/lib/geometry";
import { PressureLogger } from "src/hydraulic-model/pressure-loggers";
import { LabelManager } from "src/hydraulic-model/label-manager";

export class PressureLoggerFactory {
  private idGenerator: IdGenerator;
  private labelManager: LabelManager;

  constructor(idGenerator: IdGenerator, labelManager: LabelManager) {
    this.idGenerator = idGenerator;
    this.labelManager = labelManager;
  }

  create(coordinates: Position, label?: string): PressureLogger {
    const id = this.idGenerator.newId();
    return new PressureLogger(id, roundCoordinates(coordinates), {
      label: label ?? this.labelManager.generateFor("pressureLogger", id),
    });
  }

  get totalGenerated(): number {
    return this.idGenerator.totalGenerated;
  }
}
