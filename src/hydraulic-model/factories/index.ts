import { ConsecutiveIdsGenerator, IdGenerator } from "src/lib/id-generator";
import { CustomerPointFactory } from "./customer-point-factory";
import { PressureLoggerFactory } from "./pressure-logger-factory";

export { CustomerPointFactory } from "./customer-point-factory";
export { PressureLoggerFactory } from "./pressure-logger-factory";

export type ModelFactories = {
  customerPointFactory: CustomerPointFactory;
  pressureLoggerFactory: PressureLoggerFactory;
};

export const initializeModelFactories = (options?: {
  customerPointIdGenerator?: IdGenerator;
  pressureLoggerIdGenerator?: IdGenerator;
}): ModelFactories => ({
  customerPointFactory: new CustomerPointFactory(
    options?.customerPointIdGenerator ?? new ConsecutiveIdsGenerator(),
  ),
  pressureLoggerFactory: new PressureLoggerFactory(
    options?.pressureLoggerIdGenerator ?? new ConsecutiveIdsGenerator(),
  ),
});
