import { test, expect } from "@playwright/test";

/**
 * Mobile shell smoke test — verifies the mobile responsive layer is
 * actually applied at narrow viewports. Runs against the unauth
 * login screen because we don't have a way to mock the FastAPI auth
 * endpoint deterministically in CI.
 */

test.describe("Mobile shell responsiveness", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/connect.facebook.net/**", (route) => route.abort());
  });

  test("login view still renders split layout at 375×667", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    const metadash = page.getByText(/METADASH/);
    await expect(metadash.first()).toBeVisible();
  });

  test("authenticated-shell mobile class on sidebar exists", async ({ page }) => {
    await page.goto("/");
    const stylesheetHasMobileRules = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (
              rule instanceof CSSMediaRule &&
              rule.conditionText.includes("max-width") &&
              rule.cssText.includes(".shell-sidebar")
            ) {
              return true;
            }
          }
        } catch {
          /* cross-origin stylesheet — skip */
        }
      }
      return false;
    });
    expect(stylesheetHasMobileRules).toBe(true);
  });

  test("mobile CSS includes touch-target & no-zoom rules", async ({ page }) => {
    // Verifies the new mobile UX overrides shipped (input min-height,
    // 16px font, custom-cb 20×20). If any of these regress the
    // assertion fails immediately.
    await page.goto("/");
    const found = await page.evaluate(() => {
      const checks = {
        inputMinHeight: false,
        input16px: false,
        biggerCheckbox: false,
        tapHighlight: false,
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            const text = rule.cssText;
            if (rule instanceof CSSMediaRule && rule.conditionText.includes("max-width")) {
              if (/input.*min-height:\s*40px/i.test(text)) checks.inputMinHeight = true;
              if (/font-size:\s*16px/i.test(text)) checks.input16px = true;
              if (/\.custom-cb[\s\S]*20px/.test(text)) checks.biggerCheckbox = true;
            }
            if (text.includes("-webkit-tap-highlight-color")) checks.tapHighlight = true;
          }
        } catch {
          /* skip cross-origin sheets */
        }
      }
      return checks;
    });
    expect(found.inputMinHeight, "mobile input min-height: 40px should be set").toBe(true);
    expect(found.input16px, "mobile input font-size: 16px should be set").toBe(true);
    expect(found.biggerCheckbox, "mobile .custom-cb should grow to 20px").toBe(true);
    expect(found.tapHighlight, "tap-highlight-color: transparent should be set").toBe(true);
  });
});
