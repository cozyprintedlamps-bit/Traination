// Starts the built app and a Chrome to look at it (playwright-core, no browser download: it uses
// the installed Chrome, else Edge; set TRAINATION_CHROME to a browser binary to use another one).
// Taken from TactileManufactory (web/tests/e2e/browser.ts).
import { chromium } from "playwright-core";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { preview } from "vite";
import type { PreviewServer } from "vite";

export interface Session {
  browser: Browser;
  server: PreviewServer;
  url: string;
  newPage(viewport?: { width: number; height: number }, query?: string): Promise<{ page: Page; context: BrowserContext; errors: string[] }>;
  close(): Promise<void>;
}

const ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"];

async function launch(): Promise<Browser | null> {
  const custom = process.env["TRAINATION_CHROME"];
  const attempts = custom ? [{ executablePath: custom, args: ARGS }] : [{ channel: "chrome", args: ARGS }, { channel: "msedge", args: ARGS }];
  for (const options of attempts) {
    try {
      return await chromium.launch(options);
    } catch {
      // try the next browser
    }
  }
  return null;
}

/** The session, or null when no browser can be started here. */
export async function openSession(): Promise<Session | null> {
  const browser = await launch();
  if (!browser) return null;
  const server = await preview({ root: process.cwd(), logLevel: "silent", preview: { port: 4190, strictPort: false } });
  const url = server.resolvedUrls?.local[0] ?? "http://localhost:4190/";
  return {
    browser,
    server,
    url,
    async newPage(viewport = { width: 1600, height: 960 }, query = "") {
      const context = await browser.newContext({ viewport, acceptDownloads: true });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error" && !/favicon|404/.test(message.text())) errors.push(message.text());
      });
      await page.goto(query ? `${url}?${query}` : url);
      return { page, context, errors };
    },
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

/** Waits until the 3D view has built what the step shows. */
export async function waitForScene(page: Page): Promise<void> {
  await page.waitForTimeout(100);
  await page.waitForFunction(() => document.querySelector('[data-testid="viewer"]')?.getAttribute("data-state") === "idle", null, { timeout: 60_000 });
}
