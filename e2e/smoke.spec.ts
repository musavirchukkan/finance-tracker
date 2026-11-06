import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "e2e@example.test";
const password = process.env.E2E_PASSWORD ?? "e2e-password-123";

async function signIn(
  page: import("@playwright/test").Page,
  creds: { email: string; password: string },
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password", { exact: true }).fill(creds.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("smoke", () => {
  test("unauthenticated overview redirects to login", async ({ page }) => {
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("bad password stays on login with an error", async ({ page }) => {
    await signIn(page, { email, password: "wrong-password-xxx" });
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("login → quick-add expense → overview shows it", async ({ page }) => {
    const note = `e2e-smoke-${Date.now()}`;

    await signIn(page, { email, password });
    await expect(page).toHaveURL(/\/overview/);
    await expect(page.getByText(/your money across all accounts/i)).toBeVisible();

    await page.goto("/quick-add");
    await page.getByLabel("Amount").fill("42");
    await page.getByPlaceholder(/e\.g\. Auto to Bandra/i).fill(note);
    await page.getByRole("button", { name: /Add Expense/i }).click();

    // Form resets after a successful save (stays on quick-add).
    await expect(page.getByLabel("Amount")).toHaveValue("");

    await page.goto("/overview");
    await expect(page.getByText(note)).toBeVisible();
  });
});
