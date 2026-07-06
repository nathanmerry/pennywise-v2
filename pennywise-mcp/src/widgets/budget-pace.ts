import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * ChatGPT Apps SDK widget for get_budget_pace.
 *
 * The MCP server registers the HTML template as a `ui://` resource with the
 * `text/html+skybridge` mime type; the tool then references it via its
 * `_meta["openai/outputTemplate"]`. ChatGPT renders the template in a sandboxed
 * iframe and the component reads the tool's `structuredContent` from
 * `window.openai.toolOutput`. Everything is inlined in the HTML (the sandbox CSP
 * blocks external scripts/styles).
 */

// Versioned URI: bump the suffix whenever the widget HTML changes so ChatGPT's
// host cache fetches the new template instead of serving a stale one.
export const BUDGET_PACE_TEMPLATE_URI = "ui://widget/pennywise-budget-pace-v2.html";
const MIME_TYPE = "text/html+skybridge";

// Read once at startup. The .html lives beside this module in src/ (dev via tsx)
// and is copied to dist/widgets/ by the build step (see package.json "build").
const WIDGET_HTML = readFileSync(
  fileURLToPath(new URL("./budget-pace.html", import.meta.url)),
  "utf8",
);

/** `_meta` to attach to the get_budget_pace TOOL DEFINITION so it renders the widget. */
export const BUDGET_PACE_TOOL_META = {
  "openai/outputTemplate": BUDGET_PACE_TEMPLATE_URI,
  "openai/toolInvocation/invoking": "Checking your budget pace…",
  "openai/toolInvocation/invoked": "Here's your pace.",
  "openai/widgetAccessible": false,
} as const;

export function registerBudgetPaceWidget(server: McpServer): void {
  server.registerResource(
    "budget-pace-widget",
    BUDGET_PACE_TEMPLATE_URI,
    {
      mimeType: MIME_TYPE,
      _meta: {
        "openai/widgetDescription":
          "Visual budget pace: how much of the flexible budget has been spent versus how far " +
          "through the pay cycle you are, plus a per-category breakdown.",
        "openai/widgetPrefersBorder": true,
      },
    },
    async () => ({
      contents: [{ uri: BUDGET_PACE_TEMPLATE_URI, mimeType: MIME_TYPE, text: WIDGET_HTML }],
    }),
  );
}
