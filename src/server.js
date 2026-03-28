import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

/* ================= ROUTE IMPORTS ================= */
import aiRoutes from "./routes/ai.js";
import candidateRoutes from "./routes/candidates.js";
import resumeRoutes from "./routes/resumes.js";
import interviewRoutes from "./routes/interviews.js";
import offerRoutes from "./routes/offers.js";
import emailRoutes from "./routes/emails.js";
import authRoutes from "./routes/auth.js";
import interviewerRoutes from "./routes/interviewers.js";
import adminRoutes from "./routes/admin.js";
import profileRoutes from "./routes/profileRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import workflowEmailRoutes from "./routes/workflowEmailRoutes.js";
/* ================= BASIC SETUP ================= */

dotenv.config();

const app = express();

// Change to localhost origins for local run.
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://d2aacj83qbzrx4.cloudfront.net",
  "https://d2se2hkbe6np2y.cloudfront.net",
  "http://hrportalfrontend.s3-website.ap-south-1.amazonaws.com",
  // "http://hrportal-ai-interview.s3-website.ap-south-1.amazonaws.com"
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

////dotenv.config();

//const app = express();
//const __filename = fileURLToPath(import.meta.url);
//const __dirname = path.dirname(__filename);

/* ================= CORS CONFIG (FINAL FIX) ================ */

//const allowedOrigins = [
//  "http://localhost:3000",
 // "https://d2aacj83qbzrx4.cloudfront.net",
 // "http://hrportalfrontend.s3-website.ap-south-1.amazonaws.com"
//];

//app.use((req, res, next) => {
 // const origin = req.headers.origin;

//  if (allowedOrigins.includes(origin)) {
 //   res.setHeader("Access-Control-Allow-Origin", origin);
 // }

  //res.setHeader("Access-Control-Allow-Credentials", "true");
 // res.setHeader(
  //  "Access-Control-Allow-Methods",
  //  "GET,POST,PUT,DELETE,OPTIONS"
 // );
  //res.setHeader(
   // "Access-Control-Allow-Headers",
  //  "Content-Type, Authorization"
 // );

 // if (req.method === "OPTIONS") {
 //   return res.sendStatus(200);
 // }

 // next();
//});

// const allowedOrigins = [
//   "http://localhost:3000",                // local frontend
//   "https://recruiter.tarassolutions.com"  // backend domain
// ];

// app.use((req, res, next) => {
//   const origin = req.headers.origin;

//   if (allowedOrigins.includes(origin)) {
//     res.setHeader("Access-Control-Allow-Origin", origin);
//   }

//   res.setHeader("Access-Control-Allow-Credentials", "true");
//   res.setHeader(
//     "Access-Control-Allow-Methods",
//     "GET,POST,PUT,DELETE,OPTIONS"
//   );
//   res.setHeader(
//     "Access-Control-Allow-Headers",
//     "Content-Type, Authorization"
//   );

//   if (req.method === "OPTIONS") {
//     return res.sendStatus(200);
//   }

//   next();
// });

/* ================= GLOBAL MIDDLEWARE ================= */

// Body parsers
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));

// Static uploads folder

app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "uploads"))
);


/* ================= ROUTES ================= */

app.use("/api/ai", aiRoutes);
app.use("/api/candidates", candidateRoutes);
app.use("/api/resumes", resumeRoutes);
app.use("/api/interviews", interviewRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/interviewers", interviewerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/workflow-emails", workflowEmailRoutes);
/* ================= HEALTH CHECK ================= */

app.get("/api/health", (req, res) => {
  res.json({
    status: "HR Portal Server is running",
    environment: process.env.NODE_ENV || "production",
    time: new Date().toISOString(),
  });
});

/* ================= MULTER ERROR HANDLER ================= */

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error("🚨 MULTER ERROR:", err.message);
    return res.status(400).json({
      error: "File upload error",
      message: err.message,
    });
  }
  next(err);
});

/* ================= GLOBAL ERROR HANDLER ================= */

app.use((err, req, res, next) => {
  console.error("🔥 SERVER ERROR:", err.stack);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message,
  });
});

/* ================= SERVER START ================= */

// ⚠️ cPanel injects PORT automatically
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// // // // // Routes
// // // // app.use('/api/candidates', require('./routes/candidates'));
// // // // app.use('/api/resumes', require('./routes/resumes'));
// // // // app.use('/api/interviews', require('./routes/interviews'));
// // // // app.use('/api/emails', require('./routes/emails'));
// // // // app.use('/api/offers', require('./routes/offers'));
// // // // app.use('/api/ai', require('./routes/ai'));

// // // // // Health check
// // // // app.get('/api/health', (req, res) => {
// // // //   res.json({ status: 'HR Portal Server is running' });
// // // // });

// // // // // Error handling middleware
// // // // app.use((err, req, res, next) => {
// // // //   console.error(err.stack);
// // // //   res.status(500).json({ error: 'Internal Server Error', message: err.message });
// // // // });

// // // // const PORT = process.env.PORT || 5000;
// // // // app.listen(PORT, () => {
// // // //   console.log(`HR Portal Server running on port ${PORT}`);
// // // // });

// // // // module.exports = app;
