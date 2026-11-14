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
    await page.getByTestId("own-track").click();
    await page.getByRole("button", { name: "Anbauen: Gerade 216 mm", exact: true }).click();
    await page.getByRole("button", { name: /rechts ↷/ }).first().click();
    await page.getByRole("button", { name: /rechts ↷/ }).first().click();
    await waitForScene(page);
    expect(await page.locator(".plan .piece").count()).toBe(3);
    await shot(page, "1-track-built");

    // half a loop: "close the track" finishes it
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: /rechts ↷/ }).first().click();
    await page.getByTestId("close-track").click();
    await waitForScene(page);
    expect(await page.getByTestId("open-end").count()).toBe(0);
    await shot(page, "1-track-closed");
    // a demo track brings no station and no signal of its own; a water tower from its category
    await page.getByRole("button", { name: "Abstellgleis" }).click();
    await waitForScene(page);
    expect(await page.locator(".plan .building").count()).toBe(0);
    await page.getByTestId("bcat-railway").click();
    await page.getByTestId("building-watertower").click();
    await waitForScene(page);
    expect(await page.locator(".plan .building").count()).toBe(1);

    const steps = ["track", "elements", "vehicles", "design", "overview", "export"];
    for (const step of steps.slice(1)) {
      await page.getByTestId(`step-${step}`).click();
      await waitForScene(page);
      if (step === "overview") await page.getByTestId("overview-parts").waitFor({ timeout: 60_000 });
      await shot(page, `${steps.indexOf(step) + 1}-${step}`);
    }
    expect(errors).toEqual([]);
  });

  it("builds track in the 3D view: first piece, the + menu, dragging, closing and clearing", async () => {
    if (!session) return;
    const { page, errors } = await session.newPage();
    await waitForScene(page);
    await page.getByTestId("own-track").click();
    // an empty plan: the button in the middle opens the menu of pieces
    await page.getByTestId("start-piece").click();
    await page.getByTestId("piece-menu").getByRole("menuitem", { name: "Gerade 216 mm", exact: true }).click();
    await waitForScene(page);
    expect(await page.locator(".plan .piece").count()).toBe(1);
    expect(await page.getByTestId("end-plus").count()).toBe(2);
    // the "+" at an end: a curve to the left
    await page.getByTestId("end-plus").last().click();
    await page.getByTestId("piece-menu").getByRole("menuitem", { name: /links/ }).first().click();
    await waitForScene(page);
    expect(await page.locator(".plan .piece").count()).toBe(2);
    // drag a straight from the list onto the "+" of a free end in the 3D view
    const plus = await page.getByTestId("end-plus").last().boundingBox();
    const viewer = await page.getByTestId("viewer").boundingBox();
    if (!plus || !viewer) throw new Error("no marker");
    await page.getByTestId("element-straight-144").dragTo(page.getByTestId("viewer"), { targetPosition: { x: plus.x - viewer.x + plus.width / 2, y: plus.y - viewer.y + plus.height / 2 } });
    await waitForScene(page);
    expect(await page.locator(".plan .piece").count()).toBe(3);
    expect(await page.getByTestId("end-plus").count()).toBe(2);
    await shot(page, "1-track-plus");
    await page.getByTestId("end-plus").last().click();
    await page.getByTestId("piece-menu").waitFor();
    await shot(page, "1-track-menu");
    await page.keyboard.press("Escape");
    // close: calculated fitting pieces where standard ones do not fit
    await page.getByTestId("close-track").click();
    await waitForScene(page);
    expect(await page.getByTestId("open-end").count()).toBe(0);
    await page.getByText(/Strecke geschlossen/).waitFor();
    await shot(page, "1-track-closed-fit");
    // clear everything, then undo
    const pieces = await page.locator(".plan .piece").count();
    await page.getByTestId("clear-track").click();
    await page.getByTestId("clear-track-yes").click();
    await waitForScene(page);
    expect(await page.locator(".plan .piece").count()).toBe(0);
    await page.keyboard.press("Control+z");
    await waitForScene(page);
    expect(await page.locator(".plan .piece").count()).toBe(pieces);
    // more templates, and a ready-made train
    await page.getByRole("button", { name: "Acht mit Brücke" }).click();
    await waitForScene(page);
    await shot(page, "1-template-eight-bridge");
    await page.getByTestId("step-vehicles").click();
    await page.getByTestId("train-cyberbrick").click();
    await expect(page.getByTestId("train-car").first().textContent()).resolves.toContain("CyberBrick");
    expect(errors).toEqual([]);
  });

  it("drags a vehicle from the palette into the train and designs it", async () => {
    if (!session) return;
    const { page, errors } = await session.newPage();
    await waitForScene(page);
    await page.getByTestId("step-vehicles").click();
    await page.getByRole("tab", { name: "Güterwagen" }).click();
    const before = await page.getByTestId("train-car").count();
    await page.getByTestId("palette-container").dragTo(page.getByTestId("train-car").first(), { targetPosition: { x: 20, y: 4 } });
    expect(await page.getByTestId("train-car").count()).toBe(before + 1);
    await expect(page.getByTestId("train-car").first().textContent()).resolves.toContain("Containerwagen");
    await page.getByRole("tab", { name: "Loks" }).click();
    await page.getByTestId("palette-cyberbrick").click();
    await waitForScene(page);
    await shot(page, "3-cyberbrick");
    await page.getByRole("radio", { name: "Ganzer Zug" }).click();
    await waitForScene(page);
    await shot(page, "3-whole-train");
    await page.getByTestId("step-design").click();
    await page.getByTestId("train-car").first().getByRole("button").first().click();
    await page.getByRole("radio", { name: "Fahrzeug" }).click();
    await page.getByRole("radio", { name: "Sterne", exact: true }).first().click();
    await page.getByTestId("lettering").fill("emma 7");
    await expect(page.getByTestId("lettering").inputValue()).resolves.toBe("EMMA 7");
    await waitForScene(page);
    await shot(page, "4-design-art");
    expect(errors).toEqual([]);
  });

  it("demo tracks, tunnels, studs on both sides and a switch with a lever", async () => {
    if (!session) return;
    const { page, errors } = await session.newPage();
    await waitForScene(page);
    // the mountain line comes with its tunnels
    await page.getByTestId("template-mountain").click();
    await waitForScene(page);
    expect(await page.locator(".plan .building").count()).toBe(3);
    await shot(page, "1-mountain");
    await page.getByTestId("template-heart").click();
    await waitForScene(page);
    expect(await page.locator(".plan .building").count()).toBe(0);
    await page.getByTestId("bcat-stations").click();
    await page.getByTestId("building-station_town").click();
    await waitForScene(page);
    await shot(page, "1-heart-town-station");
    // the track configurator: studs LEGO left, DUPLO right; a switch with a lever
    await page.getByTestId("step-elements").click();
    await expect(page.getByRole("heading", { name: "Schienenkonfigurator" }).count()).resolves.toBe(1);
    await page.getByRole("button", { name: /^Gerade 216 mm/ }).first().click();
    await page.getByTestId("studs-left").getByRole("radio", { name: "LEGO", exact: true }).click();
    await page.getByTestId("studs-right").getByRole("radio", { name: "DUPLO", exact: true }).click();
    await waitForScene(page);
    await expect(page.getByText("mit LEGO- und DUPLO-Noppen").first().count()).resolves.toBeGreaterThan(0);
    await shot(page, "2-studs");
    await page.getByRole("button", { name: /^Weiche links/ }).first().click();
    await page.getByLabel(/Stellhebel/).check();
    await waitForScene(page);
    await expect(page.getByText(/Weiche links R182 mit Stellhebel/).first().count()).resolves.toBeGreaterThan(0);
    await shot(page, "2-lever");
    expect(errors).toEqual([]);
  });

  it("exports buildings as a 3MF file", async () => {
    if (!session) return;
    const { page, errors } = await session.newPage();
    await waitForScene(page);
    await page.getByTestId("template-mountain").click();
    await waitForScene(page);
    await page.getByTestId("step-export").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Gebäude als 3MF" }).click()]);
    expect(download.suggestedFilename()).toMatch(/buildings\.3mf$/);
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
