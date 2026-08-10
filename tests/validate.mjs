import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const requiredFiles = [
  "index.html",
  "styles.css",
  "data.js",
  "questions.js",
  "app.js",
  "assets/og.png",
  ".nojekyll",
  ".github/workflows/pages.yml",
];

for (const file of requiredFiles) {
  assert.ok(fs.existsSync(path.join(root, file)), `Missing required file: ${file}`);
}

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");

for (const asset of ["styles.css", "data.js", "questions.js", "app.js"]) {
  assert.ok(html.includes(asset), `index.html does not reference ${asset}`);
}

assert.match(html, /HKSI P1/i, "Page title should identify HKSI P1");
assert.match(html, /v3\.5/i, "Current study-guide version must be visible");
assert.match(html, /60/, "Official question count must be visible");
assert.match(html, /90/, "Official duration must be visible");
assert.match(html, /70%/, "Official pass mark must be visible");
assert.match(html, /assets\/og\.png/, "Open Graph image must be wired into the page");

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const file of ["data.js", "questions.js", "app.js"]) {
  new vm.Script(read(file), { filename: file });
}
vm.runInContext(read("data.js"), sandbox, { filename: "data.js" });
vm.runInContext(read("questions.js"), sandbox, { filename: "questions.js" });

const data = sandbox.window.HKSI_DATA;
const questions = sandbox.window.HKSI_QUESTIONS;
assert.ok(data && Array.isArray(data.topics), "HKSI_DATA.topics is required");
assert.equal(data.topics.length, 9, "The syllabus must contain nine topics");
assert.ok(Array.isArray(questions), "HKSI_QUESTIONS must be an array");
assert.equal(questions.length, 60, "The full mock bank must contain exactly 60 questions");
assert.ok(Array.isArray(data.updates) && data.updates.length === 5, "The v3.5 update watchlist must contain five areas");

const expectedDistribution = { 1: 3, 2: 3, 3: 8, 4: 14, 5: 11, 6: 9, 7: 6, 8: 3, 9: 3 };
const distribution = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [index + 1, 0]));
const ids = new Set();
const allowedTypes = new Set(["single", "incorrect", "most_likely", "combination"]);
const allowedDifficulty = new Set(["基础", "中等", "较难"]);

questions.forEach((question, index) => {
  const label = `Question ${index + 1}`;
  assert.match(question.id, /^P1-\d{3}$/, `${label} has an invalid id`);
  assert.ok(!ids.has(question.id), `${label} duplicates id ${question.id}`);
  ids.add(question.id);
  assert.ok(Number.isInteger(question.topic) && question.topic >= 1 && question.topic <= 9, `${label} has an invalid topic`);
  distribution[question.topic] += 1;
  assert.ok(allowedDifficulty.has(question.difficulty), `${label} has an invalid difficulty`);
  assert.ok([1, 2, 3].includes(question.cognitiveLevel), `${label} has an invalid cognitive level`);
  assert.ok(allowedTypes.has(question.type), `${label} has an invalid type`);
  assert.equal(typeof question.stem, "string", `${label} needs a stem`);
  assert.ok(question.stem.trim().length >= 12, `${label} stem is too short`);
  assert.ok(Array.isArray(question.options), `${label} options must be an array`);
  assert.equal(question.options.length, 4, `${label} must have four options`);
  assert.ok(question.options.every((option) => typeof option === "string" && option.trim()), `${label} contains an empty option`);
  assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer <= 3, `${label} has an invalid answer`);
  for (const field of ["explanation", "trap", "salesHook"]) {
    assert.ok(typeof question[field] === "string" && question[field].trim(), `${label} needs ${field}`);
  }
});

assert.deepEqual(distribution, expectedDistribution, "Question distribution must match the official-weight mock blueprint");
assert.deepEqual(
  [...ids].sort(),
  Array.from({ length: 60 }, (_, index) => `P1-${String(index + 1).padStart(3, "0")}`),
  "Question ids must run continuously from P1-001 to P1-060",
);

const topicCounts = Object.fromEntries(data.topics.map((topic) => [topic.id, topic.mockCount]));
assert.deepEqual(topicCounts, expectedDistribution, "Topic mock counts must match the question bank");
assert.equal(data.topics.reduce((sum, topic) => sum + topic.mockCount, 0), 60, "Topic mock counts must sum to 60");

const forbiddenExtensions = new Set([".zip", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"]);
const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  if (entry.name === ".git" || entry.name === "node_modules") return [];
  const absolute = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(absolute) : [absolute];
});

for (const file of walk(root)) {
  assert.ok(!forbiddenExtensions.has(path.extname(file).toLowerCase()), `Source document must not be published: ${path.relative(root, file)}`);
}

console.log("Validated HKSI P1 site: 9 topics, 60 original questions, safe publish tree.");
