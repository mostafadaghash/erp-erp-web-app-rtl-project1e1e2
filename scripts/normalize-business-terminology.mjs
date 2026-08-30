import { promises as fs } from "node:fs";
import path from "node:path";

const FIX = process.argv.includes("--fix");
const ROOTS = ["src", "convex", "shared", "tests"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SELF_CHECK_TEST = path.normalize("tests/businessTerminology.test.ts");

const phraseReplacements = [
  ["عكس الحركة المالية يعكس القيد المرتبط بها.", "إلغاء الحركة المالية يُلغي أثر القيد المرتبط بها تلقائيًا."],
  ["سيتم إنشاء حركة عكسية موثقة بدل حذف الحركة الأصلية.", "سيتم إلغاء أثر الحركة مع الاحتفاظ بالحركة الأصلية في السجل."],
  ["تم إلغاء الحركة وتسجيل الحركة العكسية", "تم إلغاء الحركة بنجاح"],
  ["سيعيد العكس المخزون والخزينة ورصيد المورد ومستند الشراء.", "سيتم إلغاء أثر المرتجع على المخزون والخزينة ورصيد المورد ومستند الشراء مع الاحتفاظ بالسجل."],
  ["سيتم عكس المخزون والفاتورة والعميل والحساب المالي.", "سيتم إلغاء أثر المرتجع على المخزون والفاتورة والعميل والحساب المالي مع الاحتفاظ بالسجل."],
  ["لا يمكن تعديل القيد المرحّل؛ التصحيح يتم بقيد عكس موثق.", "لا يمكن تعديل القيد المرحّل؛ التصحيح يتم بإلغاء القيد مع تسجيل العملية في السجل."],
  ["عكس تشغيلي مالي", "إلغاء حركة مالية"],
  ["<b>العكس:</b>", "<b>سبب الإلغاء:</b>"],
  ["عكس لـ", "إلغاء للمستند"],
  ["أو عكسه حسب الصلاحيات.", "أو إلغاؤه حسب الصلاحيات."],
  ["ترحيل قيد العكس", "تأكيد الإلغاء"],
  ["سيتم إنشاء قيد عكسي", "سيتم إنشاء قيد إلغاء"],
  ["قيد عكسي", "قيد إلغاء"],
  ["الحركة العكسية", "حركة الإلغاء"],
  ["حركة عكسية", "حركة إلغاء"],
];

const wordReplacements = [
  ["معكوسة", "ملغاة"],
  ["معكوسًا", "ملغيًا"],
  ["معكوس", "ملغي"],
  ["العكسية", "الإلغاء"],
  ["عكسية", "إلغاء"],
  ["العكس", "الإلغاء"],
  ["عكسه", "إلغاؤه"],
  ["عكسها", "إلغاؤها"],
  ["عكسهم", "إلغاؤهم"],
  ["عكس", "إلغاء"],
  ["الإبطال", "الإلغاء"],
  ["إبطال", "إلغاء"],
  ["مبطلة", "ملغاة"],
  ["مبطل", "ملغي"],
];

const bannedWords = [
  "معكوسة",
  "معكوس",
  "العكسية",
  "عكسية",
  "العكس",
  "عكسه",
  "عكسها",
  "عكسهم",
  "عكس",
  "الإبطال",
  "إبطال",
  "مبطلة",
  "مبطل",
];

const arabicWord = (word) => new RegExp(`(?<![\\p{L}\\p{N}_])${word}(?![\\p{L}\\p{N}_])`, "gu");

async function collectFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolute));
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(absolute);
    }
  }
  return files;
}

function normalize(content) {
  let next = content;
  for (const [from, to] of phraseReplacements) next = next.replaceAll(from, to);
  for (const [from, to] of wordReplacements) next = next.replace(arabicWord(from), to);
  return next;
}

function findViolations(content) {
  const matches = [];
  for (const word of bannedWords) {
    const regex = arabicWord(word);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const before = content.slice(0, match.index);
      const line = before.split("\n").length;
      matches.push({ word, line });
    }
  }
  return matches;
}

const files = [];
for (const root of ROOTS) {
  try {
    files.push(...await collectFiles(root));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

let changed = 0;
for (const file of files) {
  if (path.normalize(file) === SELF_CHECK_TEST) continue;
  const current = await fs.readFile(file, "utf8");
  const next = normalize(current);
  if (next !== current) {
    changed += 1;
    if (FIX) await fs.writeFile(file, next, "utf8");
  }
}

const violations = [];
for (const file of files) {
  if (path.normalize(file) === SELF_CHECK_TEST) continue;
  const content = await fs.readFile(file, "utf8");
  for (const match of findViolations(content)) violations.push(`${file}:${match.line} — ${match.word}`);
}

if (!FIX && changed > 0) {
  console.error(`وجدت ${changed} ملفات تحتاج لتوحيد المسميات. شغّل: node scripts/normalize-business-terminology.mjs --fix`);
  process.exitCode = 1;
}

if (violations.length > 0) {
  console.error("ما زالت هناك مسميات غير معتمدة:\n" + violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(FIX ? `تم توحيد المسميات في ${changed} ملفًا.` : "المسميات التجارية موحدة.");
}
