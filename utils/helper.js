function parseBTEBResult(rawText) {
  // Extract GPAs and return as a clean object: { "1": 3.86, "2": null, "3": 4.00 }
  const extractGPAs = (text) => {
    const gpas = {};
    const matches = text.match(/gpa\d+\s*:\s*([\d.]+|ref)/gi) || [];
    matches.forEach(item => {
      const [key, value] = item.split(":");
      const semNum = key.trim().toLowerCase().replace("gpa", ""); 
      gpas[semNum] = value.trim().toLowerCase() === "ref" ? null : Number(value.trim());
    });
    return gpas;
  };

  const extractSubjects = (text) => {
    const matches = text.match(/\d+\s*\([^)]+\)/g) || [];
    return matches.map(s => s.replace(/\s+/g, ""));
  };

  const students = [];
  
  const instituteMatch = rawText.match(/\d+\s*-\s*(.*?),/);
  const instituteName = instituteMatch ? instituteMatch[1].trim() : "Unknown Institute";
  
  const semesterMatch = rawText.match(/(\d+)(?:st|nd|rd|th)\s+semester/i);
  const currentExamSemester = semesterMatch ? parseInt(semesterMatch[1]) : null;

  const dateMatch = rawText.match(/Date\s*:\s*(\d{2}-\d{2}-\d{4})/i);
  const publishDate = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

  const getStudentStatus = (gpaObj, subjects) => {
    if (gpaObj[currentExamSemester] !== undefined && gpaObj[currentExamSemester] !== null) {
      return "PASSED";
    }
    return subjects.length >= 4 ? "DROPPED" : "REFERRED";
  };

  let match;

  // 🔥 THE FIX: Explicitly match either (...) OR {...} blocks
  const gpaPattern = /(\d{6})\s*(?:\(([^)]+)\)|\{([^}]+)\})/g;
  
  while ((match = gpaPattern.exec(rawText)) !== null) {
    const roll = match[1];
    // match[2] is text inside (), match[3] is text inside {}
    const content = match[2] || match[3]; 
    if (!/gpa/i.test(content)) continue; 

    const gpas = extractGPAs(content);
    const subjects = extractSubjects(content);
    
    students.push({
      roll,
      gpas, 
      status: getStudentStatus(gpas, subjects),
      referredSubjects: subjects,
    });
  }

  // 3: DROPPED (The bottom section)
  const droppedPattern = /(\d{6})\s*\{([^}]*)\}/g;
  while ((match = droppedPattern.exec(rawText)) !== null) {
    const roll = match[1];
    if (students.some(s => s.roll === roll) || /gpa/i.test(match[2])) continue;
    
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