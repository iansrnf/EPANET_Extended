import * as Comlink from "comlink";
import { EitherHandler } from "./shared";
import { lib } from "./api";

Comlink.transferHandlers.set("EITHER", EitherHandler);
Comlink.expose(lib);
