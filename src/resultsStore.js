const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const jsonPath = path.join(dataDir, "results.json");
const csvPath = path.join(dataDir, "results.csv");

const CSV_HEADER = ["submittedAt", "studentId", "studentName", "score", "totalPossible", "percent"].join(",");

function ensureDataDirSync() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

async function ensureInitialized() {
  ensureDataDirSync();

  if (!fs.existsSync(jsonPath)) {
    await fsp.writeFile(jsonPath, JSON.stringify({ submissions: [] }, null, 2), "utf8");
  }

  if (!fs.existsSync(csvPath)) {
    await fsp.writeFile(csvPath, CSV_HEADER + "\n", "utf8");
  }
}

function csvSafe(v) {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function writeCsvFromSubmissions(submissions) {
  const lines = [CSV_HEADER];
  for (const s of submissions) {
    lines.push(
      [
        csvSafe(s.submittedAt),
        csvSafe(s.studentId),
        csvSafe(s.studentName),
        csvSafe(s.score),
        csvSafe(s.totalPossible),
        csvSafe(s.percent),
      ].join(","),
    );
  }
  await fsp.writeFile(csvPath, lines.join("\n") + "\n", "utf8");
}

async function appendSubmission(submission) {
  // JSON: อ่าน-เพิ่ม-เขียน (ปริมาณนักเรียนเล็ก ใช้งานจริงยังพอไหว)
  const raw = await fsp.readFile(jsonPath, "utf8").catch(() => null);
  const parsed = raw ? JSON.parse(raw) : { submissions: [] };
  if (!Array.isArray(parsed.submissions)) parsed.submissions = [];
  parsed.submissions.push(submission);
  await fsp.writeFile(jsonPath, JSON.stringify(parsed, null, 2), "utf8");

  // CSV: append บรรทัดเดียว
  const line = [
    csvSafe(submission.submittedAt),
    csvSafe(submission.studentId),
    csvSafe(submission.studentName),
    csvSafe(submission.score),
    csvSafe(submission.totalPossible),
    csvSafe(submission.percent),
  ].join(",");

  await fsp.appendFile(csvPath, line + "\n", "utf8");
}

async function readAllSubmissions() {
  const raw = await fsp.readFile(jsonPath, "utf8");
  const parsed = JSON.parse(raw);
  const submissions = Array.isArray(parsed.submissions) ? parsed.submissions : [];
  // เรียงจากล่าสุดก่อน
  submissions.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  return submissions;
}

async function deleteOne({ submittedAt, studentId }) {
  if (!submittedAt || !studentId) return { removed: 0 };

  const raw = await fsp.readFile(jsonPath, "utf8").catch(() => null);
  const parsed = raw ? JSON.parse(raw) : { submissions: [] };
  const submissions = Array.isArray(parsed.submissions) ? parsed.submissions : [];

  const before = submissions.length;
  const kept = submissions.filter(
    (s) => String(s.submittedAt) !== String(submittedAt) || String(s.studentId) !== String(studentId),
  );
  const removed = before - kept.length;

  await fsp.writeFile(jsonPath, JSON.stringify({ submissions: kept }, null, 2), "utf8");
  await writeCsvFromSubmissions(kept);
  return { removed };
}

async function clearAll() {
  await fsp.writeFile(jsonPath, JSON.stringify({ submissions: [] }, null, 2), "utf8");
  await writeCsvFromSubmissions([]);
  return { cleared: true };
}

const resultsStore = {
  ensureInitialized,
  appendSubmission,
  readAllSubmissions,
  deleteOne,
  clearAll,
};

module.exports = { resultsStore };

