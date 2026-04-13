import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount React trees after each test so side effects and timers
// don't leak between tests.
afterEach(() => {
  cleanup();
});
