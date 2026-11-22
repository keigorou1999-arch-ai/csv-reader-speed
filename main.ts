import { closeSync, openSync, readFileSync, writeSync } from "node:fs";
import { Buffer } from "node:buffer";
import { setFlagsFromString } from "node:v8";

try {
  setFlagsFromString("--no-incremental-marking");
} catch {}

const { run } = await import("./solve.js");

const fd = openSync("/output/answers.json", "w");

function emit(s) {
  const b = Buffer.from(s, "utf8");
  const n = b.length;
  let off = 0;
  while (off < n) off += writeSync(fd, b, off, n - off);
}

const cases = JSON.parse(readFileSync("/input/cases.json", "utf8"));

emit("[");
for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  cases[i] = null; // each case is answered and written before the next is read
  if (i > 0) emit(",");
  emit(JSON.stringify(run(c.input)));
}
emit("]");

closeSync(fd);
