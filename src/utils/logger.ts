import type { Logger } from "../types.js";

const noop = () => {};

export const nullLogger: Logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

let currentLogger: Logger = nullLogger;

export function setLogger(logger: Logger | null): void {
  currentLogger = logger ?? nullLogger;
}

export function getLogger(): Logger {
  return currentLogger;
}
