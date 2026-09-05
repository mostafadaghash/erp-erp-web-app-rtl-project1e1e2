import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { launchStagingBrowser } from "../staging-browser-e2e.mjs";

const outputRoot = resolve("test-results/printing");
const screenshotRoot = join(outputRoot, "screenshots");

const invoiceBody = `
  <main class="document">
    <header>
      <div>
        <h1>فاتورة مبيعات تجريبية</h1>
        <p>مستند آلي لا يحتوي على بيانات عملاء حقيقية</p>
      </div>
      <div class="meta">
        <strong>INV-ACCEPTANCE-001</strong>
        <span>2026-09-04</span>
      </div>
    </header>
    <section class="parties">
      <div><span>المنشأة</span><strong>Business Tech ERP</strong></div>
      <div><span>العميل</span><strong>عميل اختبار الطباعة</strong></div>
    </section>
    <table>
      <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
      <tbody>
        <tr><td>صنف تجريبي أ</td><td>2</td><td>125.00</td><td>250.00</td></tr>
        <tr><td>صنف تجريبي ب</td><td>1</td><td>75.00</td><td>75.00</td></tr>
      </tbody>
    </table>
    <section class="totals">
      <div><span>الإجمالي</span><strong>325.00 ج.م</strong></div>
      <div><span>المدفوع</span><strong>300.00 ج.م</strong></div>
      <div class="due"><span>المتبقي</span><strong>25.00 ج.م</strong></div>
    </section>
    <footer>تم إنشاء هذا المستند بواسطة Chromium لاختبار الطباعة الآلي.</footer>
  </main>`;

function htmlDocument({ thermal = false } = {}) {
  const pageSize = thermal ? "80mm 150mm" : "A4";
  const pageMargin = thermal ? "4mm" : "12mm";
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <style>
    @page { size: ${pageSize}; margin: ${pageMargin}; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #eef2f6; color: #14213d; font-family: Arial, Tahoma, sans-serif; }
    .document { width: ${thermal ? "72mm" : "186mm"}; min-height: ${thermal ? "135mm" : "273mm"}; margin: 0 auto; padding: ${thermal ? "4mm" : "12mm"}; background: white; }
    header { display: flex; justify-content: space-between; gap: 8mm; border-bottom: 2px solid #164e63; padding-bottom: 5mm; }
    h1 { margin: 0 0 2mm; font-size: ${thermal ? "16px" : "27px"}; }
    p, span { margin: 0; color: #526175; font-size: ${thermal ? "10px" : "13px"}; }
    .meta { display: grid; gap: 2mm; text-align: left; direction: ltr; }
    .parties { display: grid; grid-template-columns: ${thermal ? "1fr" : "1fr 1fr"}; gap: 4mm; margin: 6mm 0; }
    .parties div { display: grid; gap: 1mm; padding: 3mm; background: #f4f7f9; border-radius: 2mm; }
    table { width: 100%; border-collapse: collapse; font-size: ${thermal ? "9px" : "13px"}; }
    th, td { padding: ${thermal ? "2mm 1mm" : "3mm"}; border-bottom: 1px solid #d8e0e8; text-align: right; }
    th { background: #164e63; color: white; }
    .totals { width: ${thermal ? "100%" : "75mm"}; margin: 7mm 0 0 auto; display: grid; gap: 2mm; }
    .totals div { display: flex; justify-content: space-between; padding: 2mm 0; }
    .totals .due { border-top: 2px solid #164e63; color: #164e63; }
    footer { margin-top: 12mm; padding-top: 4mm; border-top: 1px solid #d8e0e8; text-align: center; font-size: ${thermal ? "8px" : "11px"}; color: #526175; }
    @media print { body { background: white; } .document { margin: 0; } }
  </style>
</head>
<body>${invoiceBody}</body>
</html>`;
}

async function sha256(path) {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

async function verifyPdf(path) {
  const content = await readFile(path);
  assert.ok(
    content.length > 10_000,
    `${path} is too small to be a browser PDF`,
  );
  assert.equal(content.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.match(content.subarray(-1024).toString("latin1"), /%%EOF/);
}

async function verifyPng(path) {
  const content = await readFile(path);
  assert.ok(
    content.length > 10_000,
    `${path} is too small to be a browser screenshot`,
  );
  assert.deepEqual(
    [...content.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  assert.ok(content.readUInt32BE(16) >= 600);
  assert.ok(content.readUInt32BE(20) >= 800);
}

async function main() {
  await mkdir(screenshotRoot, { recursive: true });
  const a4Pdf = join(outputRoot, "a4-invoice.pdf");
  const thermalPdf = join(outputRoot, "thermal-receipt.pdf");
  const a4Screenshot = join(screenshotRoot, "a4-invoice.png");
  const browser = await launchStagingBrowser();

  try {
    const page = await browser.newPage({
      viewport: { width: 1240, height: 1754 },
    });
    await page.setContent(htmlDocument(), { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: a4Pdf,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    await page.emulateMedia({ media: "screen" });
    await page.screenshot({ path: a4Screenshot, fullPage: true });

    await page.setContent(htmlDocument({ thermal: true }), {
      waitUntil: "load",
    });
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: thermalPdf,
      width: "80mm",
      height: "150mm",
      printBackground: true,
      preferCSSPageSize: true,
    });
    await page.close();

    await verifyPdf(a4Pdf);
    await verifyPdf(thermalPdf);
    await verifyPng(a4Screenshot);

    const manifest = {
      generatedBy: "Chromium",
      browserVersion: await browser.version(),
      syntheticDataOnly: true,
      files: {
        "a4-invoice.pdf": await sha256(a4Pdf),
        "thermal-receipt.pdf": await sha256(thermalPdf),
        "screenshots/a4-invoice.png": await sha256(a4Screenshot),
      },
    };
    await writeFile(
      join(outputRoot, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    console.log(
      `Browser printing acceptance passed with ${manifest.browserVersion}.`,
    );
  } finally {
    await browser.close();
  }
}

await main();
