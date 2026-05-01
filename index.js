require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { PDFParse } = require("pdf-parse");
const { MongoClient, ServerApiVersion } = require("mongodb");
const { parseBTEBResult } = require("./utils/helper");

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS so your Next.js app can connect
app.use(cors());

// Using memoryStorage so the file stays in buffer (RAM) instead of being saved to disk
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.get("/", (req, res) => {
  res.send("NUBNGPI Server is running... ✅");
});

async function run() {
  try {
    // await client.connect();
    const db = client.db("Nubngpi_DB");
    // console.log("MongoDB connected Successfully ✅");

    const studentsCollection = db.collection("students");
    const resultCollection = db.collection("results");

    app.get("/api/students", async (req, res) => {
      const cursor = studentsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/api/results", async (req, res) => {
      const cursor = resultCollection.find();
      const result = await cursor.toArray();
      res.status(200).send(result);
    });

    app.get("/api/result/:roll", async (req, res) => {
      const roll = req.params.roll;
      const query = { roll };
      const studentResult = await resultCollection.findOne(query);
      const studentProfile = await studentsCollection.findOne(query);
      res.status(200).send({ studentProfile, studentResult });
    });

app.get("/api/latest/results", async (req, res) => {
  try {
    // 1. Find the highest lastSeenExam across the whole collection
    const metadata = await resultCollection
      .find({})
      .sort({ lastSeenExam: -1 })
      .limit(1)
      .toArray();

    if (metadata.length === 0) return res.status(200).json([]);
    
    const globalLatestSemester = metadata[0].lastSeenExam;

    const latestResults = await resultCollection
      .aggregate([
        // 2. ONLY include students from the absolute latest upload who are NOT archived
        {
          $match: {
            lastSeenExam: globalLatestSemester,
            isArchived: false, // This automatically hides "removed" status students
            roll: { $gte: "829428" } // Your specific range filter
          },
        },
        // 3. Join with students collection
        {
          $lookup: {
            from: "students",
            localField: "roll",
            foreignField: "roll",
            as: "studentDetails",
          },
        },
        // 4. Skip if student profile (name/image) is missing
        {
          $unwind: "$studentDetails",
        },
        // 5. Clean output for the latest semester only
        {
          $project: {
            _id: 1,
            roll: 1,
            studentName: "$studentDetails.name",
            registration: "$studentDetails.registration",
            studentImage: "$studentDetails.img",
            latestGPA: 1,
            referredSubjects: 1,
            // Extract specific details from the nested semesters object
            status: {
              $let: {
                vars: {
                  currentSem: { $objectToArray: "$semesters" }
                },
                in: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: "$$currentSem",
                        as: "s",
                        cond: { $eq: [{ $toInt: "$$s.k" }, globalLatestSemester] }
                      }
                    },
                    0
                  ]
                }
              }
            }
          },
        },
        {
          $project: {
            _id: 1,
            roll: 1,
            studentName: 1,
            registration: 1,
            studentImage: 1,
            latestGPA: 1,
            referredSubjects: 1,
            semester: { $literal: globalLatestSemester },
            status: "$status.v.status",
            publishedDate: "$status.v.publishedDate"
          }
        },
        { $sort: { roll: 1 } },
      ])
      .toArray();

    res.status(200).json(latestResults);
  } catch (error) {
    console.error("Error fetching latest results:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

    app.post(
      "/api/upload-result",
      upload.single("result-pdf"),
      async (req, res) => {
        try {
          if (!req.file)
            return res.status(400).send({ message: "No file uploaded" });

          const parser = new PDFParse({ data: req.file.buffer });
          const result = await parser.getText();
          await parser.destroy();

          const { students, currentExamSemester, publishDate } =
            parseBTEBResult(result.text);

          if (students.length === 0) {
            return res.status(422).send({ message: "No student data found" });
          }

          const bulkOps = students.map((s) => {
            // Determine highest semester key to find the "latest" GPA
            const semKeys = Object.keys(s.gpas)
              .map(Number)
              .sort((a, b) => b - a);
            const highestSem =
              semKeys.length > 0 ? semKeys[0] : currentExamSemester;
            const latestGpaVal = s.gpas[highestSem];
            const latestGPAStr =
              latestGpaVal !== null ? latestGpaVal.toString() : "ref";

            const updateFields = {
              lastSeenExam: currentExamSemester,
              latestGPA: latestGPAStr,
              referredSubjects: s.referredSubjects,
              isArchived: false,
            };

            // Dynamically build the nested 'semesters' object using MongoDB dot notation
            semKeys.forEach((semNum) => {
              if (semNum === currentExamSemester) {
                // Write full data for the current exam semester
                updateFields[`semesters.${semNum}`] = {
                  gpa: s.gpas[semNum],
                  status: s.status,
                  publishedDate: publishDate,
                };
              } else {
                // For historical semesters, only update GPA and status (if they cleared a referral)
                updateFields[`semesters.${semNum}.gpa`] = s.gpas[semNum];
                if (s.gpas[semNum] !== null) {
                  updateFields[`semesters.${semNum}.status`] = "PASSED";
                }
              }
            });

            return {
              updateOne: {
                filter: { roll: s.roll },
                update: { $set: updateFields },
                upsert: true,
              },
            };
          });

          await resultCollection.bulkWrite(bulkOps);

          // Ghost Detection: Mark dropouts with the "not found" object you requested
          await resultCollection.updateMany(
            { lastSeenExam: { $lt: currentExamSemester }, isArchived: false },
            {
              $set: {
                isArchived: true,
                [`semesters.${currentExamSemester}`]: { status: "removed" },
              },
            },
          );

          res
            .status(200)
            .send({ success: true, count: students.length, publishDate });
        } catch (error) {
          console.error("UPLOAD ERROR:", error);
          res
            .status(500)
            .send({ message: "Server Error", error: error.message });
        }
      },
    );
  } finally {
  }
}
run().catch(console.dir);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT} 🚀`);
});
