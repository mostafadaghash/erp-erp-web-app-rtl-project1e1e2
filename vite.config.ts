import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react({
      babel: {
        // Dev-only: stamp every JSX element with its source location
        // (data-chef-loc="relPath:line:col") so the Stunning visual editor can
        // map a clicked DOM node back to its exact line in the source file.
        // Strictly gated on development so production builds ship no data-chef-*.
        plugins: mode === "development" ? ["./babel-plugin-chef-loc.cjs"] : [],
      },
    }),
    // The code below enables dev tools like taking screenshots of your site
    // while it is being developed on stunning.so.
    // Feel free to remove this code if you're no longer developing your app with Stunning.
    mode === "development"
      ? {
          name: "inject-stunning-dev",
          transform(code: string, id: string) {
            if (id.includes("main.tsx")) {
              return {
                code: `${code}

/* Added by Vite plugin inject-stunning-dev */
window.addEventListener('message', async (message) => {
  if (message.source !== window.parent) return;
  if (message.data.type !== 'stunningPreviewRequest') return;

  // The dev-tools worker (screenshots + visual editor) is bundled INTO this app
  // at /public/scripts/worker.bundled.mjs, so we load it same-origin. This works
  // in local dev (the E2B sandbox can't reach the developer's localhost) and in
  // production alike, with no cross-origin dependency on the Stunning server.
  // Fall back to the hosted copy only if the same-origin module is missing
  // (e.g. an older sandbox image built before the worker was bundled in).
  const sameOriginUrl = window.location.origin + '/scripts/worker.bundled.mjs';
  const hostedUrl = 'https://builder.stunning.so/scripts/worker.bundled.mjs';
  let worker;
  try {
    worker = await import(sameOriginUrl);
  } catch (e) {
    console.warn('[Stunning] same-origin worker missing, falling back to hosted copy', e);
    worker = await import(hostedUrl);
  }
  await worker.respondToMessage(message);
});
            `,
                map: null,
              };
            }
            return null;
          },
        }
      : null,
    // End of code for taking screenshots on stunning.so.
  ].filter(Boolean),
  server: {
    host: true,
    allowedHosts: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
