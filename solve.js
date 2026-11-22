// A drop-in reader for csv-reader 1.0.0's reading of {text, header}.
//
// The text is scanned once, left to right. Instead of looking at every
// character in JavaScript, the scan asks the engine for the next comma, the
// next LF and the next CR with indexOf and keeps each answer until the scan
// walks past it, so each of the three characters is searched for at most once
// over the whole text.

const CR_RE = /\r\n?/g;

export function run(input) {
  let text = input.text;
  const header = !!input.header;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const len = text.length;
  const rows = [];
  const errors = [];
  let columns = null;
  let width = -1;

  let i = 0;
  let line = 1;
  let recIdx = 0; // index of the record being read, among all records
  let nc = -1; // next comma at or after some earlier position
  let nl = -1; // next LF
  let nr = -1; // next CR
  let k = 0;

  while (i < len) {
    const recLine = line;
    const rowIdx = header ? (recIdx === 0 ? null : recIdx - 1) : recIdx;
    const rec = [];
    let n = 0;
    let empty = true; // the line has no characters of its own yet
    let done = false;

    do {
      let acc = '';
      let hasAcc = false;
      let qclosed = false; // the field opened with a quote that closed
      let junkLen = 0; // characters appended after that closing quote
      let value = '';
      let e = i;

      if (text.charCodeAt(i) === 34) {
        // a field that opens with a quote
        empty = false;
        const rs = i + 1;
        let s = rs;
        let qi = text.indexOf('"', s);
        let qacc = '';
        let qhas = false;
        while (qi >= 0 && text.charCodeAt(qi + 1) === 34) {
          qacc += text.slice(s, qi + 1); // keeps one quote of the pair
          qhas = true;
          s = qi + 2;
          qi = text.indexOf('"', s);
        }
        if (qi < 0) {
          // the quote never closes: it is a literal character and the text
          // after it is read again as unquoted
          errors.push({ code: 'unterminated_quote', line: recLine, row: rowIdx });
          acc = '"';
          hasAcc = true;
          i = rs;
        } else {
          let v = qhas ? qacc + text.slice(s, qi) : text.slice(s, qi);
          if (nr < rs) { k = text.indexOf('\r', rs); nr = k < 0 ? len : k; }
          if (nr < qi) {
            // a CR inside the quotes: each CRLF or lone CR reads as LF
            v = v.replace(CR_RE, '\n');
            let p = v.indexOf('\n');
            while (p >= 0) { line++; p = v.indexOf('\n', p + 1); }
          } else {
            if (nl < rs) { k = text.indexOf('\n', rs); nl = k < 0 ? len : k; }
            while (nl < qi) { line++; k = text.indexOf('\n', nl + 1); nl = k < 0 ? len : k; }
          }
          acc = v;
          hasAcc = true;
          i = qi + 1;
          qclosed = true; // what follows the closing quote is appended as it stands
        }
      }

      for (;;) {
        if (nc < i) { k = text.indexOf(',', i); nc = k < 0 ? len : k; }
        if (nl < i) { k = text.indexOf('\n', i); nl = k < 0 ? len : k; }
        if (nr < i) { k = text.indexOf('\r', i); nr = k < 0 ? len : k; }
        e = nc;
        if (nl < e) e = nl;
        if (nr < e) e = nr;
        const ch = e < len ? text.charCodeAt(e) : 0;
        if (ch === 13 && text.charCodeAt(e + 1) !== 10) {
          // a CR not followed by LF is dropped
          if (e > i) {
            acc = hasAcc ? acc + text.slice(i, e) : text.slice(i, e);
            hasAcc = true;
            empty = false;
            junkLen += e - i;
          }
          errors.push({ code: 'stray_cr', line: recLine, row: rowIdx });
          i = e + 1;
          continue;
        }
        if (e > i) {
          value = hasAcc ? acc + text.slice(i, e) : text.slice(i, e);
          empty = false;
          junkLen += e - i;
        } else {
          value = hasAcc ? acc : '';
        }
        if (ch === 44) { i = e + 1; empty = false; }
        else if (ch === 10) { i = e + 1; line++; done = true; }
        else if (ch === 13) { i = e + 2; line++; done = true; }
        else { i = e; done = true; }
        break;
      }

      // only a closing quote followed by characters of its own is junk: a lone
      // CR there is dropped and leaves nothing behind
      if (qclosed && junkLen > 0) {
        errors.push({ code: 'quote_junk', line: recLine, row: rowIdx });
      }
      rec[n++] = value;
    } while (!done);

    if (empty) continue; // a line left with no characters is no record

    if (width < 0) {
      width = n;
      if (header) columns = rec;
      else rows.push(rec);
      recIdx = 1;
    } else if (n === width) {
      rows.push(rec);
      recIdx++;
    } else if (n < width) {
      for (k = n; k < width; k++) rec[k] = '';
      rows.push(rec);
      errors.push({ code: 'short_row', line: recLine, row: rowIdx, fields: n });
      recIdx++;
    } else {
      const extra = rec.slice(width);
      rec.length = width;
      rows.push(rec);
      errors.push({ code: 'long_row', line: recLine, row: rowIdx, extra });
      recIdx++;
    }
  }

  // a header asked for with no record at all leaves no columns to name
  if (header && width < 0) columns = [];

  return { columns, rows, errors };
}
