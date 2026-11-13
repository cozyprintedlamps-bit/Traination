// The app in a real browser: every step renders, the plan reacts, the export writes a 3MF.
// Needs the built app (`npm run build`) and an installed Chrome; run with `npm run test:e2e`.
// TRAINATION_SHOTS=<folder> saves screenshots of every step.
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Page } from "playwright-core";
import { openSession, waitForScene } from "./browser";
import type { Session } from "./browser";

const SHOTS = process.env["TRAINATION_SHOTS"];
let session: Session | null;

beforeAll(async () => {
  session = await openSession();
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
});
afterAll(async () => {
  await session?.close();
});

const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) });
};

describe("app", () => {
  it("walks through all steps without errors", async () => {
    if (!session) return;
    const { page, errors } = await session.newPage();
    await waitForScene(page);
    expect(Number(await page.getByTestId("viewer").getAttribute("data-parts"))).toBeGreaterThan(10);
    await shot(page, "1-track");

    // add a curve to the right on the open end of a fresh plan
    await page.getByRole("button", { name: "Leer" }).click();
    await page.getByRole("button", { name: "Anbauen: Gerade 216 mm" }).click();
    await page.getByRole("button", { name: /rechts ↷/ }).first().click();
    await page.getByRole("button", { name: /rechts ↷/ }).first().click();
    await waitForScene(page);
    expect(await page.locator(".plan .piece").count()).toBe(3);
    await shot(page, "1-track-built");
    await page.getByRole("button", { name: "Abstellgleis" }).click();
    await waitForScene(page);

    for (const step of ["elements", "vehicles", "design", "export"]) {
      await page.getByTestId(`step-${step}`).click();
      await waitForScene(page);
      await shot(page, `${["track", "elements", "vehicles", "design", "export"].indexOf(step) + 1}-${step}`);
    }
    await page.getByRole("button", { name: "Alles zeigen" }).click();
    await shot(page, "5-export-fit");
    expect(errors).toEqual([]);
  });

  it("exports the track as a 3MF file", async () => {
    if (!session) return;
    const { page, errors } = await session.newPage();
    await waitForScene(page);
    await page.getByTestId("step-export").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Strecke als 3MF" }).click()]);
    const path = await download.path();
    const zip = unzipSync(new Uint8Array(readFileSync(path)));
    expect(Object.keys(zip)).toContain("Metadata/model_settings.config");
    expect(download.suggestedFilename()).toMatch(/\.3mf$/);
    await page.getByText(/gespeichert/).waitFor();
    expect(errors).toEqual([]);
  });

  it("switches to English and to the dark theme", async () => {
    if (!session) return;
    const { page, errors } = await session.newPage({ width: 1280, height: 860 }, "lang=en");
    await waitForScene(page);
    await expect(page.getByRole("heading", { name: "Plan the track" }).count()).resolves.toBe(1);
    await page.getByRole("button", { name: "Light / dark" }).click();
    await shot(page, "en-dark");
    expect(errors).toEqual([]);
  });

  it("works on a phone-sized screen", async () => {
    if (!session) return;
    const { page, errors } = await session.newPage({ width: 390, height: 844 });
    await waitForScene(page);
    await shot(page, "phone");
    const overflow = await page.evaluate(() => {
      const wide = [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5);
      return { by: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide: wide.slice(0, 5).map((e) => `${e.tagName}.${e.className}`) };
    });
    expect(overflow).toEqual({ by: 0, wide: [] });
    expect(errors).toEqual([]);
  });
});
