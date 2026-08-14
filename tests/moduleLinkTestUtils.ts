import { readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import ts from "typescript";

// Convex source imports are extensionless at runtime. Integration tests create
// temporary extensionless JavaScript modules so the same suite works on
// Windows without requiring Developer Mode or symbolic-link privileges.
export async function symlink(target: string, destination: string) {
  const source = await readFile(resolve(dirname(destination), target), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
  }).outputText;
  await writeFile(destination, javascript, "utf8");
}

export { unlink };
