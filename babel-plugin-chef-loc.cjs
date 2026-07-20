/**
 * babel-plugin-chef-loc
 *
 * Dev-only Babel plugin that stamps every JSX *host* element (lowercase tags
 * like <div>, <h1>, <button>) with a `data-chef-loc="<relPath>:<line>:<col>"`
 * attribute. This is what lets Stunning's visual (WYSIWYG) editor map a clicked
 * DOM node back to the exact line in the React source so an edit can be written
 * back to the real source file.
 *
 * Because the attribute is emitted by the SAME compile that renders the element,
 * the line:col always points at the CURRENT source and is re-stamped on every
 * HMR recompile — i.e. it self-heals after each edit.
 *
 * IMPORTANT: this must only run in development. It is wired into vite.config.ts
 * via `@vitejs/plugin-react`'s `babel.plugins` option, gated on
 * `mode === 'development'`, so production builds ship zero data-chef-* markup
 * (no bloat, no source-path leak).
 *
 * Feel free to remove this file (and its reference in vite.config.ts) if you're
 * no longer developing your app with Stunning.
 */
const path = require('path');

// The sandbox working directory. Source paths are made relative to this so the
// editor receives stable paths like "src/App.tsx" regardless of the machine.
const WORK_DIR = '/home/user/project';

const ATTR_NAME = 'data-chef-loc';

module.exports = function chefLocPlugin({ types: t }) {
  return {
    name: 'chef-loc',
    visitor: {
      JSXOpeningElement(nodePath, state) {
        const node = nodePath.node;

        // No source location available (e.g. generated nodes) — skip.
        if (!node.loc) {
          return;
        }

        const nameNode = node.name;

        // Only stamp simple host elements (lowercase intrinsic tags) and simple
        // component identifiers. Skip member expressions (e.g. <Foo.Bar/>) and
        // namespaced names to keep the attribute injection safe.
        if (!t.isJSXIdentifier(nameNode)) {
          return;
        }

        // Don't double-stamp if the attribute is already present (e.g. the
        // author wrote one, or a previous pass added it).
        const alreadyStamped = node.attributes.some(
          (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: ATTR_NAME }),
        );
        if (alreadyStamped) {
          return;
        }

        // Resolve the source file relative to the project root.
        const filename = state.file && state.file.opts && state.file.opts.filename;
        if (!filename) {
          return;
        }
        let relPath = path.relative(WORK_DIR, filename);
        // Fall back to a basename-ish path if the file lives outside WORK_DIR
        // (shouldn't happen in the sandbox, but be defensive).
        if (relPath.startsWith('..')) {
          relPath = filename;
        }
        // Normalize to forward slashes for stable selectors across platforms.
        relPath = relPath.split(path.sep).join('/');

        const { line, column } = node.loc.start;
        // column is 0-based in Babel; keep it as-is — the patcher accounts for it.
        const locValue = `${relPath}:${line}:${column}`;

        node.attributes.push(t.jsxAttribute(t.jsxIdentifier(ATTR_NAME), t.stringLiteral(locValue)));
      },
    },
  };
};
