/* ==========================================================================
   Экспорт таблицы в CSV и XLSX без внешних библиотек (работает с file://).
   XLSX собирается вручную: минимальный набор частей OOXML в ZIP без сжатия.
   exportTable(filename, format, headers, rows) — rows: массив массивов строк.
   ========================================================================== */

function exDownload(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exCsv(headers, rows) {
  const cell = (v) => {
    const s = v == null ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM и ";" — чтобы Excel открывал кириллицу и колонки без импорта-мастера
  return "﻿" + [headers].concat(rows).map((r) => r.map(cell).join(";")).join("\r\n");
}

let EX_CRC_TABLE = null;
function exCrc32(bytes) {
  if (!EX_CRC_TABLE) {
    EX_CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      EX_CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = EX_CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ZIP без сжатия (метод 0): достаточно для валидного .xlsx
function exZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  files.forEach((f) => {
    const name = enc.encode(f.name);
    const data = enc.encode(f.content);
    const crc = exCrc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 имена
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  });
  let cdSize = 0;
  central.forEach((c) => (cdSize += c.length));
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob(chunks.concat(central, [new Uint8Array(end.buffer)]), {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function exColName(i) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function exXlsx(headers, rows) {
  const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  const rowXml = (r, ri, bold) =>
    `<row r="${ri + 1}">${r.map((v, ci) => `<c r="${exColName(ci)}${ri + 1}" t="inlineStr"${bold ? ' s="1"' : ""}><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join("")}</row>`;
  const widths = headers.map((h, ci) => Math.min(48, Math.max(String(h).length, ...rows.map((r) => String(r[ci] == null ? "" : r[ci]).length)) + 2));
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${rowXml(headers, 0, true)}${rows.map((r, i) => rowXml(r, i + 1, false)).join("")}</sheetData></worksheet>`;
  const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return exZip([
    { name: "[Content_Types].xml", content: `${H}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", content: `${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: `${H}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `${H}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", content: `${H}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>` },
    { name: "xl/worksheets/sheet1.xml", content: sheet },
  ]);
}

function exportTable(filename, format, headers, rows) {
  if (format === "xlsx") exDownload(exXlsx(headers, rows), `${filename}.xlsx`);
  else exDownload(new Blob([exCsv(headers, rows)], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
}

// Кнопка "Экспорт" с меню CSV / XLSX. onPick(format) вызывается при выборе формата.
function exportMenuHtml(id, label, hint) {
  return `<div class="exp-wrap" id="${id}">
    <button type="button" class="btn-secondary exp-btn" aria-haspopup="true" aria-expanded="false"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 14v2h12v-2"/></svg>${label}</button>
    <div class="exp-menu" hidden>${hint ? `<div class="exp-hint">${hint}</div>` : ""}<button type="button" data-exp="csv">CSV</button><button type="button" data-exp="xlsx">XLSX</button></div>
  </div>`;
}

function bindExportMenu(id, onPick) {
  const wrap = document.getElementById(id);
  if (!wrap) return;
  const btn = wrap.querySelector(".exp-btn");
  const menu = wrap.querySelector(".exp-menu");
  const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); document.removeEventListener("click", outside, true); };
  const outside = (e) => { if (!wrap.contains(e.target)) close(); };
  btn.addEventListener("click", () => {
    if (!menu.hidden) return close();
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    document.addEventListener("click", outside, true);
  });
  menu.querySelectorAll("[data-exp]").forEach((b) => b.addEventListener("click", () => { close(); onPick(b.dataset.exp); }));
}


// ---- PDF через печать: печатная версия в скрытом iframe с теми же стилями, дальше системный диалог "Сохранить как PDF".
// Заголовок страницы на время печати становится именем файла. Общий каркас для карточек клиента/компании и платежей.
const EX_PDF_CSS = "*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.pdf-section{margin-top:28px}.pdf-section>h2{font-size:17px;margin:0 0 12px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;break-after:avoid}.pdf-section tr{break-inside:avoid}.pdf-note{color:#6b7280;font-size:13px}body{background:#fff;padding:24px;margin:0}.pdf-head h1{margin:0 0 4px;font-size:22px}.pdf-meta{color:#6b7280;font-size:13px;margin-bottom:20px}.profile-flat-edit,.copy-icon-btn,.row-kebab,.copied-flag,.id-copy svg,.pd-actions,.vb-row-btn,.btn-primary,.btn-secondary,.exp-wrap,.acc-nonzero,.icon-btn,.ed-step-link,.ed-step-help,.ed-see-all,.collapsible-card-chevron,.au-sec-summary{display:none!important}.card{box-shadow:none}.client-detail-grid,.pd-grid{grid-template-columns:1fr!important}.ed-chart-box{height:auto!important;display:block!important;margin:0 0 12px;break-inside:avoid}.ed-chart-svg{display:block;width:100%;height:auto;max-height:240px;overflow:hidden}.ed-volume{margin:0 0 20px}.ed-steps{grid-template-columns:1fr!important}.ed-step{break-inside:avoid}";

function exPdfHtml(fileTitle, name, meta, bodyHtml) {
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) => `<link rel="stylesheet" href="${l.href}">`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${pdEscape(fileTitle)}</title>${links}<style>${EX_PDF_CSS}</style></head><body><div class="pdf-head"><h1>${pdEscape(name)}</h1><div class="pdf-meta">${meta}</div></div>${bodyHtml}</body></html>`;
}

function exPrintHtml(html, fileTitle) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();

  const prevTitle = document.title;
  const done = () => { document.title = prevTitle; frame.remove(); };
  const waits = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).map(
    (l) => new Promise((resolve) => { l.addEventListener("load", resolve); l.addEventListener("error", resolve); setTimeout(resolve, 3000); })
  );
  Promise.all(waits).then(() => {
    document.title = fileTitle;
    frame.contentWindow.addEventListener("afterprint", done);
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => { if (frame.isConnected) done(); }, 60000);
  });
}