import { describe, it, expect, vi } from "vitest";
import { getLogger, setLogger, nullLogger } from "./logger.js";
import type { Logger } from "../types.js";

describe("logger", () => {
  it("defaults to nullLogger which no-ops safely", () => {
    setLogger(null);
    const logger = getLogger();
    expect(logger).toBe(nullLogger);
    expect(() => {
      logger.debug("test");
      logger.info("test");
      logger.warn("test");
      logger.error("test");
    }).not.toThrow();
  });

  it("routes log calls to custom logger when configured", () => {
    const customLogger: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    setLogger(customLogger);
    const logger = getLogger();

    logger.info({ id: 1 }, "Info message");
    expect(customLogger.info).toHaveBeenCalledWith({ id: 1 }, "Info message");

    logger.warn("Warning");
    expect(customLogger.warn).toHaveBeenCalledWith("Warning");

    setLogger(null);
    expect(getLogger()).toBe(nullLogger);
  });
});
