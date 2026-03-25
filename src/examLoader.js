const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");

function readFirstXlsxFileName(examDir) {
  const files = fs.readdirSync(examDir);
  const xlsxFiles = files.filter((f) => /\.xlsx$/i.test(f));
  if (xlsxFiles.length === 0) {
    throw new Error("ไม่พบไฟล์ .xlsx ในโฟลเดอร์โปรเจกต์");
  }
  // ใช้ไฟล์แรก (ในโปรเจกต์นี้มีไฟล์ Excel แค่ 1 ไฟล์)
  return xlsxFiles[0];
}

function normalizeOptionValue(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s;
}

function parseNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildQuestionsFromSheet2D(rows2D) {
  // โครงคอลัมน์ตามที่คุณบอก:
  // A: โจทย์
  // B: ตัวเลือก 1
  // C: ตัวเลือก 2
  // D: ตัวเลือก 3
  // E: ตัวเลือก 4
  // F: คะแนนแต่ละข้อ
  // G: ตัวเลือกที่ถูกต้อง (เช่น 1..4)
  const questions = [];

  // รูปแบบที่พบในไฟล์ตัวอย่าง:
  // row 0: ชื่อสอบ
  // row 1: หัวตาราง (คอลัมน์ A=โจทย์, คอลัมน์ G="ตัวเลือกที่ถูกต้อง")
  // row >=2: ข้อสอบจริง
  // เราจะคัดกรองแถวให้เหลือเฉพาะข้อสอบจริงโดยเช็คว่า
  // - ข้อความคอลัมน์ A ต้องเริ่มด้วย "โจทย์" และไม่ใช่แค่ "โจทย์"
  // - เฉลยคอลัมน์ G ต้องอยู่ในช่วง "1".."4"
  for (let r = 0; r < rows2D.length; r++) {
    const row = rows2D[r] || [];
    const questionText = normalizeOptionValue(row[0]);
    if (!questionText) continue;
    const t = String(questionText).trim();
    if (t === "โจทย์") continue; // หัวตาราง
    if (!/^โจทย์/i.test(t)) continue; // แถวชื่อสอบ/แถวอื่นๆ

    const options = [1, 2, 3, 4].map((idx) => normalizeOptionValue(row[idx]));
    const marks = parseNumber(row[5]);
    const correctRaw = normalizeOptionValue(row[6]);

    const correctOption = correctRaw ? String(correctRaw).trim() : null;
    if (!correctOption) continue;
    if (!/^[1-4]$/.test(correctOption)) continue; // กันหัวตารางที่ G ไม่ใช่ 1..4

    const id = `q${questions.length + 1}`;
    questions.push({
      id,
      text: questionText,
      options, // [opt1,opt2,opt3,opt4]
      marks,
      correctOption, // "1".."4"
    });
  }

  if (questions.length === 0) {
    throw new Error("ไม่พบข้อมูลข้อสอบใน Excel");
  }

  const totalPossible = questions.reduce((sum, q) => sum + q.marks, 0);

  return { questions, totalPossible };
}

async function loadExamFromFirstXlsx(examDir) {
  const xlsxName = readFirstXlsxFileName(examDir);
  const fullPath = path.join(examDir, xlsxName);

  const workbook = XLSX.readFile(fullPath);
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];

  // header:1 => ได้เป็น 2 มิติ [row][col]
  const rows2D = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });

  // แถวแรกในไฟล์ตัวอย่างเป็นหัวข้อการสอบ (มักอยู่ที่คอลัมน์ A)
  const examTitleFromSheet = normalizeOptionValue(rows2D?.[0]?.[0]);

  const { questions, totalPossible } = buildQuestionsFromSheet2D(rows2D);

  const questionsPublic = questions.map((q) => ({
    id: q.id,
    text: q.text,
    options: q.options,
    marks: q.marks,
  }));

  function evaluateSubmission({ studentId, studentName, answers }) {
    let score = 0;
    const details = questions.map((q) => {
      const chosen = answers[q.id] !== undefined ? String(answers[q.id]) : null;
      const isCorrect = chosen !== null && chosen === q.correctOption;
      const awarded = isCorrect ? q.marks : 0;
      if (isCorrect) score += q.marks;
      return {
        questionId: q.id,
        chosenOption: chosen,
        correctOption: q.correctOption,
        isCorrect,
        awarded,
      };
    });

    const percent = totalPossible > 0 ? (score / totalPossible) * 100 : 0;

    return {
      submittedAt: new Date().toISOString(),
      studentId,
      studentName,
      answers,
      score,
      totalPossible,
      percent,
      details,
    };
  }

  return {
    examName: examTitleFromSheet || xlsxName.replace(/\.xlsx$/i, ""),
    questions,
    questionsPublic,
    totalPossible,
    evaluateSubmission,
  };
}

module.exports = { loadExamFromFirstXlsx };

