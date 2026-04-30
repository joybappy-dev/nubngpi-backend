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
        const latestResults = await resultCollection
          .aggregate([
            // 1. Join with students collection
            {
              $lookup: {
                from: "students", // Name of your students collection
                localField: "roll", // Field in results
                foreignField: "roll", // Field in students
                as: "studentDetails", // Name of the array to output
              },
            },
            // 2. Convert studentDetails array to a single object
            {
              $unwind: {
                path: "$studentDetails",
                preserveNullAndEmptyArrays: true, // Keep result even if student info is missing
              },
            },
            // 3. Project only the fields you need for a clean response
            {
              $project: {
                _id: 1,
                roll: 1,
                status: 1,
                latestGpa: 1,
                latestSemester: 1,
                referredSubjects: 1,
                // Map student info to clean keys
                studentName: "$studentDetails.name",
                registration: "$studentDetails.registration",
                studentImage: "$studentDetails.img",
                department: "$studentDetails.department",
              },
            },
            // 4. Sort by latest GPA (optional, good for rankings)
            { $sort: { latestGpa: -1 } },
          ])
          .toArray();

        res.status(200).json(latestResults);
      } catch (error) {
        console.error("Error fetching latest results:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // POST new result
    app.post(
      "/api/upload-result",
      upload.single("result-pdf"),
      async (req, res) => {
        try {
          if (!req.file) {
            return res.status(400).send({ message: "No file uploaded" });
          }

          // console.log("Processing file:", req.file.originalname);

          // 1. Initialize the parser using the BUFFER from memory
          // Instead of 'url', we use 'data'
          const parser = new PDFParse({ data: req.file.buffer });

          // 2. Extract the text
          const result = await parser.getText();

          // 3. Log the result to see what we're working with
          // console.log("--- Extracted Content Start ---");
          // console.log(result.text);
          // console.log("--- Extracted Content End ---");

          // 4. Clean up the parser instance to free up memory
          await parser.destroy();

          // CALL THE PARSER
          // console.log(result.text);
          const structuredData = parseBTEBResult(result.text);
          // console.log(structuredData.students);

          await resultCollection.deleteMany({});
          const dbresult = await resultCollection.insertMany(
            structuredData.students,
          );
          res.status(200).send(dbresult);

          // For now, send the JSON back to the frontend to see the magic
        } catch (error) {
          // console.error("Parsing Error:", error);
          res
            .status(500)
            .send({ message: "Internal Server Error during parsing" });
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
