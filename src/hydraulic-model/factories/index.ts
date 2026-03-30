import { ConsecutiveIdsGenerator, IdGenerator } from "src/lib/id-generator";
import { CustomerPointFactory } from "./customer-point-factory";
import { PressureLoggerFactory } from "./pressure-logger-factory";
import { LabelManager } from "src/hydraulic-model/label-manager";

export { CustomerPointFactory } from "./customer-point-factory";
export { PressureLoggerFactory } from "./pressure-logger-factory";

export type ModelFactories = {
  customerPointFactory: CustomerPointFactory;
  pressureLoggerFactory: PressureLoggerFactory;
};

export const initializeModelFactories = (options: {
  customerPointIdGenerator?: IdGenerator;
  pressureLoggerIdGenerator?: IdGenerator;
  labelManager: LabelManager;
}): ModelFactories => ({
  customerPointFactory: new CustomerPointFactory(
    options.customerPointIdGenerator ?? new ConsecutiveIdsGenerator(),
    options.labelManager,
  ),
  pressureLoggerFactory: new PressureLoggerFactory(
    options.pressureLoggerIdGenerator ?? new ConsecutiveIdsGenerator(),
  ),
});
