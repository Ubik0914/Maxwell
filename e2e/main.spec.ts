import { test, expect, type Page } from "@playwright/test";

/**
 * Main user flow (spec Section 103):
 * Sign up -> create Workspace -> create Story -> confirm START/GOAL ->
 * insert Task A on the START->GOAL edge -> add Task B -> connect A->B ->
 * B is BLOCKED -> A DONE -> B READY -> B DONE -> Goal reached -> Story
 * COMPLETED.
 *
 * This can't be executed inside the sandbox this was authored in (its
 * egress policy blocks direct HTTPS to *.supabase.co — see repo issue
 * #6), so it has not been run end-to-end here. Run it against a real
 * Supabase-backed deployment: `npm run test:e2e`.
 */

async function signUpAndReachWorkspaces(page: Page) {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "password123";

  await page.goto("/signup");
  await page.fill("#name", "E2E Test User");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.fill("#passwordConfirmation", password);
  await page.click('button[type="submit"]');

  // If email confirmation is required, this flow can't proceed
  // automatically — the project must have it disabled for CI/E2E use.
  await page.waitForURL("**/workspaces", { timeout: 15000 });
}

test("sign up, build a graph, and complete the story", async ({ page }) => {
  await signUpAndReachWorkspaces(page);

  // Create Workspace
  await page.fill("#name", "E2E Workspace");
  await page.click('button:has-text("Create Workspace")');
  await page.waitForURL("**/stories");

  // Create Story
  await page.click('button:has-text("New Story")');
  await page.fill("#title", "E2E Story");
  await page.fill("#startState", "Requirements approved");
  await page.fill("#goalState", "Available in production");
  await page.click('button:has-text("Create")');
  await page.waitForURL(/\/stories\/[0-9a-f-]+$/);

  // START and GOAL nodes are present
  await expect(page.getByText("START", { exact: true })).toBeVisible();
  await expect(page.getByText("GOAL", { exact: true })).toBeVisible();

  // Insert Task A on the START -> GOAL edge
  await page.hover(".react-flow__edge");
  await page.click('button[title="Insert task"]');
  await page.fill("#insert-task-title", "Task A");
  await page.click('button:has-text("Insert")');
  await expect(page.getByText("Task A")).toBeVisible();

  // Add Task B via the toolbar
  // Icon-only on the canvas toolbar, so it's addressed by its name
  // rather than by label text.
  await page.click('button[aria-label="New task"]');
  await page.fill("#task-title", "Task B");
  await page.click('button:has-text("Create")');
  await expect(page.getByText("Task B")).toBeVisible();

  // Connect Task A -> Task B by dragging its source handle onto B's target handle
  const taskANode = page.locator(".react-flow__node", { hasText: "Task A" });
  const taskBNode = page.locator(".react-flow__node", { hasText: "Task B" });
  const sourceHandle = taskANode.locator(".react-flow__handle-right");
  const targetHandle = taskBNode.locator(".react-flow__handle-left");
  await sourceHandle.dragTo(targetHandle);

  // Task B should now show BLOCKED
  await page.click(`text=Task B`);
  await expect(page.locator("#panel-status")).toHaveValue("BLOCKED");
  await page.click('button[aria-label="Close"]');

  // Mark Task A DONE
  await page.click("text=Task A");
  await page.selectOption("#panel-status", "DONE");
  await page.click('button[aria-label="Close"]');

  // Task B should now be READY
  await page.click("text=Task B");
  await expect(page.locator("#panel-status")).toHaveValue("READY");

  // Mark Task B DONE — this should complete the story
  await page.selectOption("#panel-status", "DONE");
  await page.click('button[aria-label="Close"]');

  await expect(page.getByText("COMPLETED")).toBeVisible();
});
