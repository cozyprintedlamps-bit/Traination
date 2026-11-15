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
    await page.getByTestId("tab-rails").click();
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
    await page.getByTestId("tab-templates").click();
    await page.getByRole("button", { name: "Abstellgleis" }).click();
    await waitForScene(page);
    expect(await page.locator(".plan .building").count()).toBe(0);
    await page.getByTestId("tab-buildings").click();
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
    await page.getByTestId("tab-rails").click();
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
    await page.getByTestId("tab-templates").click();
    await page.getByRole("button", { name: "Acht mit Brücke" }).click();
    await waitForScene(page);
    await shot(page, "1-template-eight-bridge");
    await page.getByTestId("step-vehicles").click();
    await page.getByTestId("train-cyberbrick").click();
    await expect(page.getByTestId("train-car").first().textContent()).resolves.toContain("CyberBrick");
    expect(errors).toEqual([]);
  });

  it("shows the plan large on the right with the structure tree: select, recolour and delete", async () => {
    if (!session) return;
    const { page, errors } = await session.newPage();
    await waitForScene(page);
    // a new project has no building of its own: put two beside the track
    await page.getByTestId("tab-buildings").click();
    await page.getByTestId("building-station_town").click();
    await page.getByTestId("building-station_town").click();
    await waitForScene(page);
    // all three categories are there from the start, closed: the plan fills the room, the train stands in it
    const groups = { track: page.getByTestId("tree-group-track"), buildings: page.getByTestId("tree-group-buildings"), trains: page.getByTestId("tree-group-trains") };
    for (const group of Object.values(groups)) await expect(group.getAttribute("aria-expanded")).resolves.toBe("false");
    await expect(groups.track.textContent()).resolves.toMatch(/^Bauteile \(\d+\)$/);
    await expect(groups.buildings.textContent()).resolves.toMatch(/^Gebäude \(\d+\)$/);
    await expect(groups.trains.textContent()).resolves.toMatch(/^Züge \(\d+\)$/);
    expect(await page.getByTestId("tree-row").count()).toBe(0);
    const closedPlan = await page.getByTestId("plan").boundingBox();
    expect(closedPlan!.height).toBeGreaterThan(450);
    expect(await page.locator(".plan .car").count()).toBeGreaterThan(2);
    expect(await page.locator(".plan .car-nose").count()).toBe(1);
    await shot(page, "1-track-tree-closed");

    // open: the panel fills the right side; the plan is on top and over 20% larger than the old small map (294 x 191)
    await groups.track.click();
    await groups.buildings.click();
    await expect(groups.track.getAttribute("aria-expanded")).resolves.toBe("true");
    await expect(groups.trains.getAttribute("aria-expanded")).resolves.toBe("false");
    const panel = await page.locator(".panel-plan").boundingBox();
    const plan = await page.getByTestId("plan").boundingBox();
    const tree = await page.getByTestId("tree-box").boundingBox();
    if (!panel || !plan || !tree) throw new Error("no panel");
    expect(panel.height).toBeGreaterThan(800);
    expect(panel.x + panel.width).toBeGreaterThan(1500);
    expect(plan.width).toBeGreaterThanOrEqual(294 * 1.2 - 2);
    expect(plan.height).toBeGreaterThanOrEqual(190 * 1.2 - 2);
    expect(plan.height).toBeLessThan(300);
    expect(plan.y + plan.height).toBeLessThanOrEqual(tree.y);

    // every piece and building has a row, with a colour field left and a bin right
    const pieces = await page.locator(".plan .piece").count();
    const houses = await page.locator(".plan .building").count();
    expect(await page.getByTestId("tree-row").count()).toBe(pieces + houses);
    await shot(page, "1-track-tree");

    // a click on a row marks the piece blue in the plan; a click in the plan selects the row
    await page.getByTestId("tree-row").nth(3).click();
    await expect(page.locator(".plan .piece.selected").count()).resolves.toBe(1);
    await expect(page.locator(".plan .tint").count()).resolves.toBeGreaterThan(0);
    await expect(page.getByTestId("tree-row").nth(3).getAttribute("aria-selected")).resolves.toBe("true");
    await page.locator(".plan .piece").nth(6).locator("polygon").first().click();
    await expect(page.getByTestId("tree-row").nth(6).getAttribute("aria-selected")).resolves.toBe("true");
    await expect(page.locator("[data-testid=tree-row][aria-selected=true]").count()).resolves.toBe(1);

    // the colour field changes the colour of this piece only
    const fill = (index: number) => page.locator(".plan .piece").nth(index).locator("polygon:not(.tint)").first().evaluate((e) => getComputedStyle(e).fill);
    const before = await fill(5);
    const other = await fill(4);
    await page.getByTestId("tree-color").nth(5).click();
    await page.locator(".tree-palette .swatch.pick").nth(9).click();
    expect(await fill(5)).not.toBe(before);
    expect(await fill(4)).toBe(other);
    await shot(page, "1-track-tree-colored");
    await page.keyboard.press("Control+z");
    expect(await fill(5)).toBe(before);

    // the bin removes the piece and what hangs behind it (the tooltip says how many)
    await expect(page.getByTestId("tree-remove").nth(pieces - 2).getAttribute("title")).resolves.toMatch(/1 folgenden/);
    await page.getByTestId("tree-remove").nth(pieces - 2).click();
    await waitForScene(page);
    expect(await page.locator(".plan .piece").count()).toBe(pieces - 2);
    expect(await page.getByTestId("tree-row").count()).toBe(pieces - 2 + houses);

    // a building: its row selects it and the bin removes it
    await page.getByTestId("tree-row").last().click();
    await expect(page.locator(".plan .building.selected").count()).resolves.toBe(1);
    await page.getByTestId("tree-remove").last().click();
    expect(await page.locator(".plan .building").count()).toBe(houses - 1);

    // the train: its vehicles are the third category; a click on one marks it blue in the plan, the bin removes it
    await groups.trains.click();
    const cars = await page.locator(".plan .car").count();
    expect(await page.getByTestId("tree-trains").locator("[data-testid=tree-row]").count()).toBe(cars);
    expect(await page.locator(".plan .car-tint").count()).toBe(0);
    await page.getByTestId("tree-trains").locator("[data-testid=tree-row]").nth(1).click();
    await expect(page.locator(".plan .car-tint").count()).resolves.toBe(1);
    await expect(page.locator(".plan .piece.selected, .plan .building.selected").count()).resolves.toBe(0);
    await expect(page.locator("[data-testid=tree-row][aria-selected=true]").count()).resolves.toBe(1);
    await shot(page, "1-track-tree-trains");
    await page.getByTestId("tree-trains").getByTestId("tree-remove").nth(1).click();
    expect(await page.locator(".plan .car").count()).toBe(cars - 1);
    expect(await page.locator(".plan .car-tint").count()).toBe(0);
    // a piece marked after it takes the mark away from the vehicle
    await page.getByTestId("tree-track").getByTestId("tree-row").nth(2).click();
    expect(await page.locator(".plan .car-tint").count()).toBe(0);
    await expect(page.locator(".plan .piece.selected").count()).resolves.toBe(1);
    // all three headers stay in sight, even with every category open
    const box = await page.getByTestId("tree-box").boundingBox();
    for (const group of Object.values(groups)) {
      const head = await group.boundingBox();
      expect(head!.y).toBeGreaterThanOrEqual(box!.y);
      expect(head!.y + head!.height).toBeLessThanOrEqual(box!.y + box!.height + 1);
    }

    // in the other steps the tree only selects
    await page.getByTestId("step-overview").click();
    for (const group of Object.values(groups)) await expect(group.isVisible()).resolves.toBe(true);
    expect(await page.getByTestId("tree-row").count()).toBeGreaterThan(0);
    expect(await page.getByTestId("tree-remove").count()).toBe(0);
    expect(await page.getByTestId("tree-color").count()).toBe(0);
    await page.getByTestId("tree-row").nth(1).click();
    await expect(page.locator(".plan .piece.selected").count()).resolves.toBe(1);
    expect(errors).toEqual([]);
  });

  it("plans the track in three tabs with preview pictures", async () => {
    if (!session) return;
    const { page, errors } = await session.newPage();
    await waitForScene(page);
    // the plan panel on the right is as wide as the page panel on the left
    const left = await page.locator(".panel-page").boundingBox();
    const right = await page.locator(".panel-plan").boundingBox();
    expect(Math.abs(left!.width - right!.width)).toBeLessThan(1);

    // templates are the first tab: a tile with a picture for every template (the empty one has none)
    await expect(page.getByRole("tab").count()).resolves.toBe(3);
    await expect(page.getByTestId("tab-templates").getAttribute("aria-selected")).resolves.toBe("true");
    expect(await page.locator("[data-testid^=template-]").count()).toBe(14);
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=panel-templates] .thumb[data-state=ready] img").length >= 10, null, { timeout: 90_000 });
    await shot(page, "1-track-tab-templates");

    // track pieces: every piece of the project has a tile with its picture
    await page.getByTestId("tab-rails").click();
    const rails = await page.locator("[data-testid=panel-rails] .thumb-tile").count();
    expect(rails).toBeGreaterThanOrEqual(9);
    await page.waitForFunction((n) => document.querySelectorAll("[data-testid=panel-rails] .thumb[data-state=ready] img").length >= n, rails, { timeout: 90_000 });
    await shot(page, "1-track-tab-rails");

    // stations and buildings, by category: a chip per category, a tile with its picture for every building of it
    await page.getByTestId("tab-buildings").click();
    const categories = { stations: 4, platforms: 3, tunnels: 3, railway: 4, town: 3 };
    await expect(page.locator("[data-testid^=bcat-]").count()).resolves.toBe(Object.keys(categories).length);
    for (const [category, tiles] of Object.entries(categories)) {
      await page.getByTestId(`bcat-${category}`).click();
      expect(await page.locator("[data-testid=panel-buildings] .thumb-tile").count(), category).toBe(tiles);
      await page.waitForFunction((n) => document.querySelectorAll("[data-testid=panel-buildings] .thumb[data-state=ready] img").length >= n, tiles, { timeout: 90_000 });
    }
    await page.getByTestId("bcat-stations").click();
    await shot(page, "1-track-tab-buildings");

    // a tile in the first tab lays the template
    await page.getByTestId("tab-templates").click();
    await page.getByTestId("own-track").click();
    await waitForScene(page);
    expect(await page.locator(".plan .piece").count()).toBe(0);
    await page.getByTestId("template-oval").click();
    await waitForScene(page);
    expect(await page.locator(".plan .piece").count()).toBeGreaterThan(5);

    // a click on a building in the tree opens its tab
    await page.getByTestId("tab-buildings").click();
    await page.getByTestId("building-station_town").click();
    await waitForScene(page);
    await page.getByTestId("tab-rails").click();
    await page.getByTestId("tree-group-buildings").click();
    await page.getByTestId("tree-row").last().click();
    await expect(page.getByTestId("tab-buildings").getAttribute("aria-selected")).resolves.toBe("true");
    expect(errors).toEqual([]);
  });

  it("opens a window next to the elements with the 3D model of the element and its settings; the whole track stays behind", async () => {
    if (!session) return;
    const { page, errors } = await session.newPage();
    await waitForScene(page);
    const trackParts = Number(await page.getByTestId("viewer").getAttribute("data-parts"));
    expect(trackParts).toBeGreaterThan(10);
    await page.getByTestId("step-elements").click();
    await expect(page.getByTestId("step-elements").textContent()).resolves.toContain("Schienen Konfigurator");
    await waitForScene(page);
    const modelReady = () => page.waitForFunction(() => document.querySelector('[data-testid="element-model"]')?.getAttribute("data-state") === "idle", null, { timeout: 60_000 });
    await modelReady();
    // the big 3D view still shows the whole track, the small one the one element
    expect(Number(await page.getByTestId("viewer").getAttribute("data-parts"))).toBe(trackParts);
    expect(Number(await page.getByTestId("element-model").getAttribute("data-parts"))).toBe(1);
    // the second window: as large as the first and right next to it; the 3D model is on top, the settings below
    // the left window lists the standard pieces only (no stud variants); the heading of the configurator is in the right window
    await expect(page.locator(".panel-page h2").textContent()).resolves.toBe("Standardelemente");
    await expect(page.getByTestId("detail").locator("h2").textContent()).resolves.toBe("Schienen Konfigurator");
    expect(await page.locator(".panel-page .card").filter({ hasText: /Noppen/ }).count()).toBe(0);
    const list = await page.locator(".panel-page").boundingBox();
    const detail = await page.getByTestId("detail").boundingBox();
    const model = await page.getByTestId("element-view").boundingBox();
    const name = await page.getByRole("textbox", { name: /Name/ }).first().boundingBox();
    if (!list || !detail || !model || !name) throw new Error("no windows");
    expect(detail.width).toBeCloseTo(list.width, 0);
    expect(detail.height).toBeCloseTo(list.height, 0);
    expect(detail.y).toBeCloseTo(list.y, 0);
    expect(detail.x).toBeGreaterThanOrEqual(list.x + list.width);
    expect(detail.x - (list.x + list.width)).toBeLessThan(30);
    expect(model.y).toBeLessThan(name.y);
    expect(model.height).toBeGreaterThan(150);
    // the settings of the element and "Schienen allgemein" are in the second window, not in the list
    await expect(page.getByTestId("detail").getByText("Schienen allgemein").count()).resolves.toBe(1);
    await expect(page.locator(".panel-page").getByText("Schienen allgemein").count()).resolves.toBe(0);
    await expect(page.getByTestId("detail").getByRole("button", { name: "Duplizieren" }).count()).resolves.toBe(1);
    // the 3D view behind starts where the windows end, and shows the track
    const stage = await page.getByTestId("viewer").boundingBox();
    expect(stage!.x).toBeGreaterThanOrEqual(detail.x + detail.width);
    await shot(page, "2-elements-window");

    // another element: the model changes, the track behind stays; a change of the length rebuilds the model
    const cards = page.locator(".panel-page .card");
    expect(await cards.count()).toBeGreaterThan(2);
    const title = async () => (await page.getByTestId("detail").locator(".section-head h3").first().textContent()) ?? "";
    const first = await title();
    await cards.nth(1).click();
    await modelReady();
    expect(await title()).not.toBe(first);
    expect(Number(await page.getByTestId("viewer").getAttribute("data-parts"))).toBe(trackParts);
    // a stud ledge on the left: LEGO studs start with 5 rows, stepped down; the rows come from a drop-down up to 20
    await cards.nth(0).click();
    await modelReady();
    const detailBox = page.getByTestId("detail");
    await detailBox.getByTestId("studs-left").getByRole("radio", { name: "LEGO", exact: true }).click();
    const rows = detailBox.getByTestId("stud-rows-left");
    const lowered = detailBox.getByTestId("stud-lowered-left");
    expect(await rows.inputValue()).toBe("5");
    await expect(lowered.isChecked()).resolves.toBe(true);
    await expect(lowered.isDisabled()).resolves.toBe(false);
    const values = await rows.locator("option").evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
    expect(values).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1)));
    // the right side is its own ledge: still without studs, so no rows there
    expect(await detailBox.getByTestId("stud-rows-right").count()).toBe(0);
    // the drop-down and the box share a line
    const rowsBox = await rows.boundingBox();
    const loweredBox = await lowered.boundingBox();
    expect(Math.abs(rowsBox!.y + rowsBox!.height / 2 - (loweredBox!.y + loweredBox!.height / 2))).toBeLessThan(12);
    expect(loweredBox!.x).toBeGreaterThan(rowsBox!.x + rowsBox!.width);
    await page.waitForTimeout(150);
    await modelReady();
    await shot(page, "2-elements-stepped-ledge");
    // one row: nothing to step down, the box is disabled but keeps its tick; with 6 rows it is on again
    await rows.selectOption("1");
    await expect(lowered.isDisabled()).resolves.toBe(true);
    await rows.selectOption("6");
    await expect(lowered.isDisabled()).resolves.toBe(false);
    await expect(lowered.isChecked()).resolves.toBe(true);
    // untick and tick again by the label
    await detailBox.getByText("abgesetzt", { exact: true }).click();
    await expect(lowered.isChecked()).resolves.toBe(false);
    await detailBox.getByText("abgesetzt", { exact: true }).click();
    await expect(lowered.isChecked()).resolves.toBe(true);
    // 20 rows build as well
    await rows.selectOption("20");
    await page.waitForTimeout(150);
    await modelReady();
    // switched off and on again, the ledge starts with the defaults again
    await detailBox.getByTestId("studs-left").locator(".chip").filter({ hasText: /^keine$/ }).click();
    expect(await detailBox.getByTestId("stud-rows-left").count()).toBe(0);
    await detailBox.getByTestId("studs-left").getByRole("radio", { name: "DUPLO", exact: true }).click();
    expect(await rows.inputValue()).toBe("5");
    await expect(lowered.isChecked()).resolves.toBe(true);

    // the plan stays on the right next to the two windows, at 1600 px and on a bigger screen
    const plan = await page.locator(".panel-plan").boundingBox();
    expect(plan!.x).toBeGreaterThanOrEqual(detail.x + detail.width);
    expect(plan!.x + plan!.width).toBeLessThanOrEqual(1600);
    expect(await page.getByTestId("tree-group-track").count()).toBe(1);
    expect(errors).toEqual([]);

    const wide = await session.newPage({ width: 1920, height: 1000 });
    await waitForScene(wide.page);
    await wide.page.getByTestId("step-elements").click();
    await waitForScene(wide.page);
    expect(await wide.page.getByTestId("plan").count()).toBe(1);
    await expect(wide.page.getByTestId("detail").isVisible()).resolves.toBe(true);
    await shot(wide.page, "2-elements-window-wide");
    expect(wide.errors).toEqual([]);
  });

  it("shows the plan with its structure tree in every step", async () => {
    if (!session) return;
    const { page, errors } = await session.newPage();
    await waitForScene(page);
    for (const step of ["track", "elements", "vehicles", "design", "overview", "export"]) {
      await page.getByTestId(`step-${step}`).click();
      await waitForScene(page);
      // the plan with the track and the train, and the three categories of the tree, all on the right
      const panel = await page.locator(".panel-plan").boundingBox();
      expect(panel, step).not.toBeNull();
      expect(panel!.x + panel!.width, step).toBeLessThanOrEqual(1600);
      expect(panel!.height, step).toBeGreaterThan(800);
      expect(await page.locator(".plan .piece").count(), step).toBeGreaterThan(5);
      expect(await page.locator(".plan .car").count(), step).toBeGreaterThan(2);
      for (const group of ["track", "buildings", "trains"]) await expect(page.getByTestId(`tree-group-${group}`).isVisible()).resolves.toBe(true);
      // a window of the step does not run into the plan
      if ((await page.getByTestId("detail").count()) > 0) {
        const detail = await page.getByTestId("detail").boundingBox();
        expect(detail!.x + detail!.width, step).toBeLessThanOrEqual(panel!.x);
      }
    }
    // in the steps for vehicles a click on a vehicle in the tree selects it for the page
    await page.getByTestId("step-design").click();
    await page.getByTestId("tree-group-trains").click();
    const heading = async () => (await page.locator(".panel-page h3").first().textContent()) ?? "";
    const before = await heading();
    await page.getByTestId("tree-trains").getByTestId("tree-row").nth(2).click();
    expect(await heading()).not.toBe(before);
    await expect(page.locator(".plan .car-tint").count()).resolves.toBe(1);
    expect(errors).toEqual([]);
  });

  it("opens a window next to trains and design with the 3D model of the train; the track stays behind", async () => {
    if (!session) return;
    const { page, errors } = await session.newPage();
    await waitForScene(page);
    const mainParts = async () => Number(await page.getByTestId("viewer").getAttribute("data-parts"));
    const seeThrough = async (id: string) => Number(await page.getByTestId(id).getAttribute("data-see-through"));
    const modelReady = async () => {
      await page.waitForTimeout(150);
      await page.waitForFunction(() => document.querySelector('[data-testid="vehicle-model"]')?.getAttribute("data-state") === "idle", null, { timeout: 60_000 });
    };
    const trackParts = await mainParts();
    expect(await page.getByTestId("detail").count()).toBe(0);
    expect(await seeThrough("viewer")).toBe(0);

    // trains: a window of the same size opens to the right; the 3D model of the vehicle is on top, the train under it
    await page.getByTestId("step-vehicles").click();
    await waitForScene(page);
    await modelReady();
    const left = await page.locator(".panel-page").boundingBox();
    const detail = await page.getByTestId("detail").boundingBox();
    const model = await page.getByTestId("vehicle-view").boundingBox();
    const list = await page.getByTestId("train-list").boundingBox();
    if (!left || !detail || !model || !list) throw new Error("no windows");
    expect(detail.width).toBeCloseTo(left.width, 0);
    expect(detail.height).toBeCloseTo(left.height, 0);
    expect(detail.x - (left.x + left.width)).toBeLessThan(30);
    expect(detail.x).toBeGreaterThanOrEqual(left.x + left.width);
    expect(model.y + model.height).toBeLessThanOrEqual(list.y);
    expect(model.y).toBeLessThan(list.y);
    // the list is in the window, not in the page on the left; the palette is left
    await expect(page.getByTestId("detail").getByTestId("train-list").count()).resolves.toBe(1);
    await expect(page.locator(".panel-page").getByTestId("train-list").count()).resolves.toBe(0);
    await expect(page.locator(".panel-page .vehicle-grid").count()).resolves.toBe(1);
    await expect(page.getByTestId("detail").getByText("Zug (vorn → hinten)").count()).resolves.toBe(1);
    // the track behind is the same as in the track step; only the small model has see-through rails
    expect(await mainParts()).toBe(trackParts);
    expect(await seeThrough("viewer")).toBe(0);
    expect(await seeThrough("vehicle-model")).toBeGreaterThan(0);
    const single = Number(await page.getByTestId("vehicle-model").getAttribute("data-parts"));
    await shot(page, "3-vehicles-window");
    // the whole train: more parts in the model, the track stays
    await page.getByRole("radio", { name: "Ganzer Zug" }).click();
    await modelReady();
    expect(Number(await page.getByTestId("vehicle-model").getAttribute("data-parts"))).toBeGreaterThan(single);
    expect(await seeThrough("vehicle-model")).toBeGreaterThan(0);
    expect(await mainParts()).toBe(trackParts);
    await shot(page, "3-vehicles-window-train");

    // design: the same window, with the model on top and the train under it; the page has the colours of the selected vehicle
    await page.getByTestId("step-design").click();
    await waitForScene(page);
    await modelReady();
    const inDesign = page.getByTestId("detail");
    await expect(inDesign.getByTestId("vehicle-view").count()).resolves.toBe(1);
    await expect(inDesign.getByTestId("train-list").count()).resolves.toBe(1);
    await expect(inDesign.getByRole("radio", { name: "Ganzer Zug" }).getAttribute("aria-checked")).resolves.toBe("true");
    const designModel = await page.getByTestId("vehicle-view").boundingBox();
    const designList = await page.getByTestId("train-list").boundingBox();
    expect(designModel!.y + designModel!.height).toBeLessThanOrEqual(designList!.y);
    expect(await seeThrough("vehicle-model")).toBeGreaterThan(0);
    expect(await mainParts()).toBe(trackParts);
    expect((await inDesign.boundingBox())!.width).toBeCloseTo(left.width, 0);
    // a click on another vehicle in the list gives the page its colours
    const heading = async () => (await page.locator(".panel-page h3").first().textContent()) ?? "";
    const before = await heading();
    expect(before).toMatch(/^Farben von /);
    await page.getByTestId("train-car").nth(1).getByRole("button").first().click();
    expect(await heading()).not.toBe(before);
    await expect(page.getByTestId("train-car").nth(1).getAttribute("class")).resolves.toContain("selected");
    await shot(page, "4-design-window");

    // back to the track: no second window, the rails are solid
    await page.getByTestId("step-track").click();
    await waitForScene(page);
    expect(await page.getByTestId("detail").count()).toBe(0);
    expect(await seeThrough("viewer")).toBe(0);
    expect(errors).toEqual([]);
  });

  it("drags a vehicle from the palette into the train and gives it a look", async () => {
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
    // the look of a vehicle (shape, pattern, lettering) is set in the trains step
    await page.getByTestId("train-car").first().getByRole("button").first().click();
    await page.getByRole("radio", { name: "Fahrzeug" }).click();
    await page.getByRole("radio", { name: "Sterne", exact: true }).first().click();
    await page.getByTestId("lettering").fill("emma 7");
    await expect(page.getByTestId("lettering").inputValue()).resolves.toBe("EMMA 7");
    await waitForScene(page);
    await shot(page, "3-vehicle-look");
    // the design step has the colours of the selected vehicle, track and buildings, but no look options; its train list is in the window
    await page.getByTestId("step-design").click();
    await waitForScene(page);
    expect(await page.locator(".panel-page").getByTestId("train-list").count()).toBe(0);
    expect(await page.getByTestId("detail").getByTestId("train-list").count()).toBe(1);
    expect(await page.getByTestId("lettering").count()).toBe(0);
    await expect(page.getByRole("heading", { name: /^Farben von / }).count()).resolves.toBe(1);
    await shot(page, "4-design-colors");
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
    await page.getByTestId("tab-buildings").click();
    await page.getByTestId("bcat-stations").click();
    await page.getByTestId("building-station_town").click();
    await waitForScene(page);
    await shot(page, "1-heart-town-station");
    // the track configurator: studs LEGO left, DUPLO right; a switch with a lever
    await page.getByTestId("step-elements").click();
    await expect(page.getByRole("heading", { name: "Schienen Konfigurator" }).count()).resolves.toBe(1);
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
