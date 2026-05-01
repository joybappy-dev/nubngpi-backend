function parseBTEBResult(rawText) {
  const extractGPAs = (text) => {
    const gpas = {};
    const matches = text.match(/gpa\d+\s*:\s*([\d.]+|ref)/gi) || [];
    matches.forEach((item) => {
      const [key, value] = item.split(":");
      const semNum = key.trim().toLowerCase().replace("gpa", "");
      gpas[semNum] =
        value.trim().toLowerCase() === "ref" ? null : Number(value.trim());
    });
    return gpas;
  };

  const extractSubjects = (text) => {
    const matches = text.match(/\d+\s*\([^)]+\)/g) || [];
    return matches.map((s) => s.replace(/\s+/g, ""));
  };

  const students = [];
  const instituteMatch = rawText.match(/\d+\s*-\s*(.*?),/);
  const instituteName = instituteMatch
    ? instituteMatch[1].trim()
    : "Unknown Institute";
  const semesterMatch = rawText.match(/(\d+)(?:st|nd|rd|th)\s+semester/i);
  const currentExamSemester = semesterMatch ? parseInt(semesterMatch[1]) : null;
  const dateMatch = rawText.match(/Date\s*:\s*(\d{2}-\d{2}-\d{4})/i);
  const publishDate = dateMatch
    ? dateMatch[1]
    : new Date().toISOString().split("T")[0];

  let match;

  // Section 1 & 2: PASSED or REFERRED (These students are NEVER "DROPPED" here)
  const gpaPattern = /(\d{6})\s*(?:\(([^)]+)\)|\{([^}]+)\})/g;
  while ((match = gpaPattern.exec(rawText)) !== null) {
    const roll = match[1];
    const content = match[2] || match[3];
    if (!/gpa/i.test(content)) continue;

    const gpas = extractGPAs(content);
    const subjects = extractSubjects(content);

    // Logic: If they have a current GPA, they PASSED. Otherwise, they are REFERRED.
    // Even with 4+ subjects here, they aren't "DROPPED" because they have a GPA structure.
    const status =
      gpas[currentExamSemester] !== undefined &&
      gpas[currentExamSemester] !== null
        ? "PASSED"
        : "REFERRED";

    students.push({
      roll,
      gpas,
      status,
      referredSubjects: subjects,
    });
  }

  // Section 3: DROPPED (Only students appearing below the 4+ failed subjects notice)
  const droppedPattern = /(\d{6})\s*\{([^}]*)\}/g;
  while ((match = droppedPattern.exec(rawText)) !== null) {
    const roll = match[1];
    // If they were already caught above or this block has GPA data, skip it.
    if (students.some((s) => s.roll === roll) || /gpa/i.test(match[2]))
      continue;

    const subjects = extractSubjects(match[2]);
    if (subjects.length === 0) continue;

    students.push({
      roll,
      gpas: { [currentExamSemester]: null },
      status: "DROPPED",
      referredSubjects: subjects,
    });
  }

  return { instituteName, currentExamSemester, publishDate, students };
}

module.exports = { parseBTEBResult };
