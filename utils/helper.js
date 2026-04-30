function parseBTEBResult(rawText) {
  const students = [];

  // 🏫 Institute Name
  const instituteMatch = rawText.match(/\d+\s*-\s*(.*?),/);
  const instituteName = instituteMatch
    ? instituteMatch[1].trim()
    : "Unknown Institute";

  // 🔧 Extract GPA (dynamic)
  function extractGPAs(text) {
    const gpas = {};
    const matches = text.match(/gpa\d+\s*:\s*([\d.]+|ref)/gi) || [];

    matches.forEach(item => {
      const [key, value] = item.split(":");
      gpas[key.trim().toLowerCase()] =
        value.trim().toLowerCase() === "ref"
          ? null
          : Number(value.trim());
    });

    return gpas;
  }

  // 🔧 Extract subjects (universal)
  function extractSubjects(text) {
    return (text.match(/\d+\([^)]*\)/g) || []).map(s =>
      s.replace(/\s+/g, "")
    );
  }

  let match;

  // =========================
  // ✅ 1. PASSED
  // =========================
  const passedPattern = /(\d{6})\s*\(([^)]+)\)/g;

  while ((match = passedPattern.exec(rawText)) !== null) {
    const roll = match[1];
    const details = match[2];

    const gpas = extractGPAs(details);

    students.push({
      roll,
      ...gpas,
      status: "PASSED",
      referredSubjects: [],
    });
  }

  // =========================
  // ✅ 2. REFERRED (WITH GPA)
  // =========================
  const referredPattern = /(\d{6})\s*\{([^}]*gpa[^}]*)\}/gi;

  while ((match = referredPattern.exec(rawText)) !== null) {
    const roll = match[1];
    const details = match[2];

    if (students.some(s => s.roll === roll)) continue;

    const gpas = extractGPAs(details);
    const subjects = extractSubjects(details);

    students.push({
      roll,
      ...gpas,
      status: "REFERRED", // ✅ ALWAYS REFERRED
      referredSubjects: subjects,
    });
  }

  // =========================
  // ✅ 3. DROPPED (NO GPA)
  // =========================
  const droppedPattern = /(\d{6})\s*\{([^}]*)\}/g;

  while ((match = droppedPattern.exec(rawText)) !== null) {
    const roll = match[1];
    const details = match[2];

    if (students.some(s => s.roll === roll)) continue;

    // skip if contains GPA → already handled
    if (/gpa/i.test(details)) continue;

    const subjects = extractSubjects(details);

    if (subjects.length === 0) continue;

    students.push({
      roll,
      status: "DROPPED",
      referredSubjects: subjects,
    });
  }

  // =========================
  // 🔃 SORT
  // =========================
  students.sort((a, b) => Number(a.roll) - Number(b.roll));

  return {
    instituteName,
    totalCount: students.length,
    students,
  };
}

module.exports = { parseBTEBResult };