import { defineConfig } from "@playwright/test";

const apiURL = "http://127.0.0.1:3198";
const baseURL = "http://127.0.0.1:3199";

export default defineConfig({
  testDir: "./test/browser",
  outputDir: ".next/playwright-results",
  use: { baseURL, browserName: "chromium" },
  webServer: [
    {
      command: "node test/fixtures/browserApi.mjs",
      env: { MOCK_API_PORT: new URL(apiURL).port },
      url: apiURL,
    },
    {
      command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${new URL(baseURL).port}`,
      env: { API_UPSTREAM: apiURL, NEXT_TELEMETRY_DISABLED: "1" },
      url: `${baseURL}/listings`,
    },
  ],
});
