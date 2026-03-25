const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const express = require("express");

const { loadExamFromFirstXlsx } = require("./src/examLoader");
const { resultsStore } = require("./src/resultsStore");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const TEACHER_PIN = process.env.TEACHER_PIN || "1234";

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

let exam = null;

async function init() {
  exam = await loadExamFromFirstXlsx(__dirname);
  await resultsStore.ensureInitialized();
}

function requireTeacher(req, res, next) {
  const pin = req.header("x-teacher-pin");
  if (!pin || pin !== TEACHER_PIN) {
    return res.status(401).json({ error: "Invalid teacher PIN" });
  }
  return next();
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "student_ux.html"));
});

app.get("/teacher", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "teacher.html"));
});

app.get("/api/exam", (req, res) => {
  res.json({
    examName: exam.examName,
    totalPossible: exam.totalPossible,
    questions: exam.questionsPublic,
  });
});

app.post("/api/submit", async (req, res) => {
  try {
    const { studentId, studentName, answers } = req.body || {};

    if (!studentId || !String(studentId).trim()) {
      return res.status(400).json({ error: "studentId is required" });
    }
    if (!studentName || !String(studentName).trim()) {
      return res.status(400).json({ error: "studentName is required" });
    }
    if (!answers || typeof answers !== "object") {
      return res.status(400).json({ error: "answers is required" });
    }

    const submission = exam.evaluateSubmission({
      studentId: String(studentId).trim(),
      studentName: String(studentName).trim(),
      answers,
    });

    await resultsStore.appendSubmission(submission);

    return res.json({
      score: submission.score,
      totalPossible: submission.totalPossible,
      percent: submission.percent,
      submittedAt: submission.submittedAt,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

app.get("/api/results", requireTeacher, async (req, res) => {
  try {
    const rows = await resultsStore.readAllSubmissions();
    return res.json({ submissions: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

app.post("/api/results/deleteOne", requireTeacher, async (req, res) => {
  try {
    const { submittedAt, studentId } = req.body || {};
    if (!submittedAt || !studentId) {
      return res.status(400).json({ error: "submittedAt and studentId are required" });
    }
    const result = await resultsStore.deleteOne({ submittedAt, studentId });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

app.post("/api/results/clearAll", requireTeacher, async (req, res) => {
  try {
    const result = await resultsStore.clearAll();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

init()
  .then(() => {
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Server running: http://localhost:${PORT}`);
      // eslint-disable-next-line no-console
      console.log(`Teacher page: http://localhost:${PORT}/teacher (PIN in TEACHER_PIN env)`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Failed to init:", err);
    process.exit(1);
  });

