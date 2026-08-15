import PDFDocument from 'pdfkit';

function fmtClock(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function fmtSrtTime(sec) {
  const h = Math.floor(sec / 3600).toString().padStart(2, '0');
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  const ms = Math.round((sec % 1) * 1000).toString().padStart(3, '0');
  return `${h}:${m}:${s},${ms}`;
}

export function toTxt(segments) {
  return segments.map((seg) => `${fmtClock(seg.start)}\n${seg.text}\n`).join('\n');
}

export function toSrt(segments) {
  return segments
    .map((seg, i) => {
      const end = seg.end ?? (segments[i + 1]?.start ?? seg.start + 4);
      return `${i + 1}\n${fmtSrtTime(seg.start)} --> ${fmtSrtTime(end)}\n${seg.text}\n`;
    })
    .join('\n');
}

/**
 * Streams a branded PDF transcript. Only user-facing fields (source URL,
 * detected language, transcript text) are included — no internal job IDs,
 * provider metadata, or file paths are ever written into the export.
 */
export function toPdfStream({ sourceUrl, language, segments }) {
  const doc = new PDFDocument({ margin: 50 });

  doc.fontSize(20).fillColor('#1C1C1A').text('Trnscrpt', { continued: false });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#57564F').text(`Source: ${sourceUrl}`);
  doc.text(`Detected language: ${language}`);
  doc.moveDown(1);
  doc.strokeColor('#E6E4DD').moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(1);

  segments.forEach((seg) => {
    doc.fontSize(10).fillColor('#2F7A4C').text(fmtClock(seg.start), { continued: true });
    doc.fillColor('#1C1C1A').text('  ' + seg.text);
    doc.moveDown(0.4);
  });

  doc.end();
  return doc; // caller pipes this to the HTTP response
}
