// Run with:  node test_rayahcare.js     (no dependencies)
const fs = require("fs"), assert = require("assert");
const html = fs.readFileSync(__dirname + "/index.html", "utf8");
const core = /<script id="core">([\s\S]*?)<\/script>/.exec(html)[1];
const mod = { exports: {} };
new Function("module", core)(mod);
const { news2, parseNotes, extractFlags, labFlags, assess } = mod.exports;
const SAMPLE = /const SAMPLE="([\s\S]*?)";\nconst esc/.exec(html)[1].replace(/\\n/g, "\n");

const base = { rr: 16, spo2: 97, o2: "air", sbp: 128, hr: 76, cons: "A", temp: 36.8 };
let n = 0;
const test = (name, fn) => { fn(); n++; console.log("ok -", name); };

test("NEWS2 normal observations score 0", () => {
  const r = news2(base); assert.equal(r.total, 0); assert.equal(r.risk, "Low");
});
test("NEWS2 boundary values (RCP chart)", () => {
  assert.equal(news2({ ...base, rr: 8 }).total, 3);   assert.equal(news2({ ...base, rr: 9 }).total, 1);
  assert.equal(news2({ ...base, rr: 21 }).total, 2);  assert.equal(news2({ ...base, spo2: 91 }).total, 3);
  assert.equal(news2({ ...base, spo2: 95 }).total, 1);assert.equal(news2({ ...base, sbp: 220 }).total, 3);
  assert.equal(news2({ ...base, sbp: 100 }).total, 2);assert.equal(news2({ ...base, hr: 131 }).total, 3);
  assert.equal(news2({ ...base, hr: 111 }).total, 2); assert.equal(news2({ ...base, temp: 35.0 }).total, 3);
  assert.equal(news2({ ...base, temp: 39.1 }).total, 2); assert.equal(news2({ ...base, o2: "oxygen" }).total, 2);
  assert.equal(news2({ ...base, cons: "CVPU" }).total, 3);
});
test("NEWS2 single red score triggers urgent review", () => {
  const r = news2({ ...base, rr: 7 }); assert.equal(r.single3, true); assert.match(r.response, /urgent ward-based/);
});
test("NEWS2 septic example totals 13 (high)", () => {
  const r = news2({ rr: 26, spo2: 92, o2: "air", sbp: 96, hr: 124, cons: "CVPU", temp: 38.9 });
  assert.equal(r.total, 13); assert.equal(r.risk, "High");
});
test("missing vitals are reported, not silently scored as 0", () => {
  assert.deepEqual(news2({ ...base, rr: "", hr: "" }).missing, ["Respiratory rate", "Pulse"]);
});
test("vitals are read from free-text notes", () => {
  const p = parseNotes(SAMPLE);
  assert.deepEqual(p.vitals, { sbp: 168, hr: 112, rr: 24, temp: 37, spo2: 95 });
  assert.equal(p.o2, "air"); assert.equal(p.cons, "A");
});
test("oxygen therapy and new confusion are detected, negation respected", () => {
  assert.equal(parseNotes("On 2 L/min oxygen via nasal cannula. Patient confused.").o2, "oxygen");
  assert.equal(parseNotes("On 2 L/min oxygen via nasal cannula. Patient confused.").cons, "CVPU");
  assert.equal(parseNotes("Patient is not confused. Room air.").cons, "A");
});
test("negation: 'no chest pain' is not a red flag", () => {
  const f = extractFlags("Comfortable. No chest pain, denies shortness of breath.");
  assert.ok(f.length === 2 && f.every(x => x.negated));
});
test("ECG ST elevation and positive troponin are flagged, negative ones are not", () => {
  const f = extractFlags("ECG: ST-segment elevation in leads II, III. Troponin I: Positive.");
  assert.ok(f.some(x => x.id === "ecg" && !x.negated)); assert.ok(f.some(x => x.id === "trop" && !x.negated));
  assert.ok(extractFlags("No ST elevation.").every(x => x.negated));
});
test("labs read from notes and flagged; sex-specific haemoglobin", () => {
  const p = parseNotes("Potassium 6.8 mmol/L, Sodium: 128, Hb 120");
  const l = labFlags(p.labs, "M");
  assert.equal(l.find(x => x.k === "k").flag, "Critically high");
  assert.equal(l.find(x => x.k === "na").flag, "Low");
  assert.equal(l.find(x => x.k === "hb").flag, "Low");
  assert.equal(labFlags({ hb: 120 }, "F")[0].flag, "Normal");
});
test("the chest-pain demo case scores NEWS2 5 and escalates to emergency response", () => {
  const r = assess({ ageYears: 54, sex: "F", category: "cardiac", notes: SAMPLE });
  assert.equal(r.news2.total, 5); assert.equal(r.level, 3);
  assert.ok(r.why.some(w => /ST-segment/.test(w)) && r.why.some(w => /Troponin/.test(w)));
  assert.ok(r.considerations.some(c => /12-lead ECG/.test(c)));
});
test("stable patient with negated symptoms stays routine", () => {
  const r = assess({ ageYears: 40, sex: "M", category: "general",
    notes: "Comfortable. No chest pain. BP 125/80, HR 72, RR 14, Temp 36.7, SpO2 98%." });
  assert.equal(r.level, 0); assert.equal(r.news2.total, 0);
});
test("children under 16 are not scored with the adult NEWS2", () => {
  const r = assess({ ageYears: 8, category: "respiratory", notes: "Wheezing. HR 140, RR 40." });
  assert.equal(r.adult, false); assert.equal(r.news2, null);
  assert.ok(r.flags.some(f => f.id === "resp" && !f.negated));
});
console.log(`\n${n} tests passed`);
