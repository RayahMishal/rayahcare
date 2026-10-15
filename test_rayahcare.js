// Run with:  node test_rayahcare.js     (no dependencies)
const fs = require("fs"), assert = require("assert");
const html = fs.readFileSync(__dirname + "/index.html", "utf8");
const core = /<script id="core">([\s\S]*?)<\/script>/.exec(html)[1];
const mod = { exports: {} };
new Function("module", core)(mod);
const { news2, extractFlags, labFlags, assess } = mod.exports;

const base = { rr: 16, spo2: 97, o2: "air", sbp: 128, hr: 76, cons: "A", temp: 36.8, notes: "", sex: "" };
let n = 0;
const test = (name, fn) => { fn(); n++; console.log("ok -", name); };

test("NEWS2 normal observations score 0", () => {
  const r = news2(base); assert.equal(r.total, 0); assert.equal(r.risk, "Low");
});
test("NEWS2 boundary values (RCP chart)", () => {
  assert.equal(news2({ ...base, rr: 8 }).total, 3);
  assert.equal(news2({ ...base, rr: 9 }).total, 1);
  assert.equal(news2({ ...base, rr: 21 }).total, 2);
  assert.equal(news2({ ...base, spo2: 91 }).total, 3);
  assert.equal(news2({ ...base, spo2: 95 }).total, 1);
  assert.equal(news2({ ...base, sbp: 220 }).total, 3);
  assert.equal(news2({ ...base, sbp: 100 }).total, 2);
  assert.equal(news2({ ...base, hr: 131 }).total, 3);
  assert.equal(news2({ ...base, hr: 111 }).total, 2);
  assert.equal(news2({ ...base, temp: 35.0 }).total, 3);
  assert.equal(news2({ ...base, temp: 39.1 }).total, 2);
  assert.equal(news2({ ...base, o2: "oxygen" }).total, 2);
  assert.equal(news2({ ...base, cons: "CVPU" }).total, 3);
});
test("NEWS2 single red score triggers urgent review", () => {
  const r = news2({ ...base, rr: 7 }); assert.equal(r.total, 3); assert.equal(r.single3, true);
  assert.match(r.response, /urgent ward-based/);
});
test("NEWS2 septic example totals 13 (high)", () => {
  const r = news2({ rr: 26, spo2: 92, o2: "air", sbp: 96, hr: 124, cons: "CVPU", temp: 38.9 });
  assert.equal(r.total, 13); assert.equal(r.risk, "High");
});
test("missing vitals are reported, not silently scored as 0", () => {
  const r = news2({ ...base, rr: "", hr: "" }); assert.deepEqual(r.missing, ["Respiratory rate", "Pulse"]);
});
test("negation: 'no chest pain' is not a red flag", () => {
  const f = extractFlags("Comfortable. No chest pain, denies shortness of breath.");
  assert.ok(f.every(x => x.negated)); assert.equal(f.length, 2);
});
test("red flag found when affirmed", () => {
  const f = extractFlags("Crushing chest pain radiating to left arm, sweating. No fever.");
  assert.ok(f.some(x => x.id === "cardiac" && !x.negated));
  assert.ok(f.some(x => x.id === "fever" && x.negated));
});
test("lab flags and sex-specific haemoglobin", () => {
  const l = labFlags({ k: "6.8", na: "128", hb: "120" }, "M");
  assert.equal(l.find(x => x.k === "k").flag, "Critically high");
  assert.equal(l.find(x => x.k === "na").flag, "Low");
  assert.equal(l.find(x => x.k === "hb").flag, "Low");
  assert.equal(labFlags({ hb: "120" }, "F")[0].flag, "Normal");
});
test("assessment levels for three example cases", () => {
  assert.equal(assess({ ...base, notes: "Comfortable. No chest pain." }).level, 0);
  const chest = assess({ rr: 22, spo2: 94, o2: "air", sbp: 104, hr: 112, cons: "A", temp: 36.9,
    notes: "Crushing chest pain radiating to the left arm, sweating. No fever." });
  assert.equal(chest.news2.total, 6); assert.equal(chest.level, 3); // urgent flag + NEWS2 >= 5 escalates
  const sepsis = assess({ rr: 26, spo2: 92, o2: "air", sbp: 96, hr: 124, cons: "CVPU", temp: 38.9, notes: "rigors", k: "4.9" });
  assert.equal(sepsis.level, 3);
});
test("every concern lists its reason", () => {
  const r = assess({ ...base, rr: 25, notes: "" }); assert.ok(r.why.length >= 1);
});
console.log(`\n${n} tests passed`);
