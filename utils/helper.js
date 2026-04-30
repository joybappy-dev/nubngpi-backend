function parseBTEBResult(rawText) {
  const students = [];

  const instituteMatch = rawText.match(/\d+\s*-\s*(.*?),/);
  const instituteName = instituteMatch ? instituteMatch[1].trim() : "Unknown Institute";

  // 1. 🔍 Detect the global semester from the text (e.g., "4th Semester")
  const semesterMatch = rawText.match(/(\d+)(?:st|nd|rd|th)\s+semester/i);
  const currentExamSemester = semesterMatch ? parseInt(semesterMatch[1]) : null;

  function extractGPAs(text) {
    const gpas = {};
    const matches = text.match(/gpa\d+\s*:\s*([\d.]+|ref)/gi) || [];
    matches.forEach(item => {
      const [key, value] = item.split(":");
      const cleanedKey = key.trim().toLowerCase();
      gpas[cleanedKey] = value.trim().toLowerCase() === "ref" ? null : Number(value.trim());
    });
    return gpas;
  }

  function extractSubjects(text) {
    return (text.match(/\d+\([^)]*\)/g) || []).map(s => s.replace(/\s+/g, ""));
  }

  // 🔥 Fixed: Uses the detected exam semester if no GPA keys exist (for DROPPED)
  function enrichWithLatest(studentObj) {
    const gpaKeys = Object.keys(studentObj).filter(key => key.startsWith("gpa"));

    if (gpaKeys.length > 0) {
      const sortedKeys = gpaKeys.sort((a, b) => {
        const numA = parseInt(a.replace("gpa", ""));
        const numB = parseInt(b.replace("gpa", ""));
        return numB - numA;
      });
      const highestKey = sortedKeys[0];
      studentObj.latestGpa = studentObj[highestKey]; 
      studentObj.latestSemester = parseInt(highestKey.replace("gpa", ""));
    } else {
      // 🎯 For DROPPED students with no GPA keys
      studentObj.latestGpa = null;
      studentObj.latestSemester = currentExamSemester; 
    }
    return studentObj;
  }

  let match;

  // 1. PASSED
  const passedPattern = /(\d{6})\s*\(([^)]+)\)/g;
  while ((match = passedPattern.exec(rawText)) !== null) {
    const gpas = extractGPAs(match[2]);
    students.push(enrichWithLatest({
      roll: match[1],
      ...gpas,
      status: "PASSED",
      referredSubjects: [],
    }));
  }

  // 2. REFERRED
  const referredPattern = /(\d{6})\s*\{([^}]*gpa[^}]*)\}/gi;
  while ((match = referredPattern.exec(rawText)) !== null) {
    const roll = match[1];
    if (students.some(s => s.roll === roll)) continue;
    const gpas = extractGPAs(match[2]);
    students.push(enrichWithLatest({
      roll,
      ...gpas,
      status: "REFERRED",
      referredSubjects: extractSubjects(match[2]),
    }));
  }

  // 3. DROPPED
  const droppedPattern = /(\d{6})\s*\{([^}]*)\}/g;
  while ((match = droppedPattern.exec(rawText)) !== null) {
    const roll = match[1];
    if (students.some(s => s.roll === roll) || /gpa/i.test(match[2])) continue;
    const subjects = extractSubjects(match[2]);
    if (subjects.length === 0) continue;
    
    // Now even DROPPED students get a latestSemester
    students.push(enrichWithLatest({
      roll,
      status: "DROPPED",
      referredSubjects: subjects,
    }));
  }

  students.sort((a, b) => Number(a.roll) - Number(b.roll));

  return { instituteName, totalCount: students.length, students };
}

module.exports = { parseBTEBResult };