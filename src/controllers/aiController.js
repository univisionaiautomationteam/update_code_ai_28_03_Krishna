import path from "path";
import fs from "fs";
import PDFDocument from "pdfkit";
import extractResumeText from "../utils/resumeExtractor.js";
import { ai } from "../config/gemini.js";
import { parseResume } from "../services/documentAI.js";
import {
  Document,
  Packer,
  Paragraph,
  Header,
  TextRun,
  ImageRun,
  AlignmentType
} from "docx";







/* ================= AI FIELD EXTRACTION ================= */

function normalizePointsToNumbered(text) {
  if (!text) return "";

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  let count = 1;

  return lines
    .map(line => {
      // 🔥 REMOVE ALL BULLET / GARBAGE PREFIXES COMPLETELY
      const cleaned = line
        .replace(/^[^a-zA-Z0-9]+/g, "")  // remove any non-text prefix
        .replace(/\s+/g, " ")
        .trim();

      return `${count++}. ${cleaned}`;
    })
    .join("\n");
}


async function extractFieldsWithAI(resumeText) {
  const prompt = `
Extract resume details.

Return ONLY JSON:
{
  "name": "",
  "role": "",
  "total_experience": "",
  "objective": "",
  "professional_summary": "",
  "skills": "",
  "work_experience": "",
  "projects": "",
  "education": ""
}

RESUME TEXT:
${resumeText}
`;

  const result = await ai.generateContent(prompt);
  return extractJSON(result.response.text());
}

/* ================= STEP 1: UPLOAD & EXTRACT ================= */

// export const convertResumeFormatController = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: "Resume file missing" });
//     }

//     const buffer = fs.readFileSync(req.file.path);
//     const resumeText = await extractResumeText(buffer);
//     const fields = await extractFieldsWithAI(resumeText);

//     res.json({ success: true, fields });
//   } catch (err) {
//     console.error("Resume extraction error:", err);
//     res.status(500).json({ error: "Resume extraction failed" });
//   }
// };

export const downloadFormattedResume = async (req, res) => {
  const { format } = req.body;

  if (format === "docx") {
    return generateFormattedResumeWord(req, res);
  }

  return generateFormattedResumePDF(req, res);
};


export const convertResumeFormatController = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Resume file missing" });
    }

    // ✅ FIX HERE
    const buffer = req.file.buffer;

    const resumeText = await extractResumeText(buffer);
    const fields = await extractFieldsWithAI(resumeText);

    res.json({ success: true, fields });

  } catch (err) {
    console.error("Resume extraction error:", err);
    res.status(500).json({ error: "Resume extraction failed" });
  }
};

/* ================= STEP 2: STREAM PDF WITH LOGO ================= */

export const generateFormattedResumePDF = async (req, res) => {
  try {
    const data = req.body;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Resume.pdf"
    );

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    // ✅ COMPANY LOGO PATH (YOUR EXACT PATH)
    const logoPath = path.join(
      process.cwd(),
      "src",
      "assest",
      "logo.png"
    );

    const drawHeader = () => {
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, doc.page.width - 150, 20, { width: 110 });
      }
      doc.moveDown(3);
    };

    // Logo on first page
    drawHeader();

    // Logo on every new page
    doc.on("pageAdded", drawHeader);

    //* ===== CONTENT ===== */

    // HEADER
    doc.fontSize(22)
      .font("Helvetica-Bold")
      .text(data.name || "", { align: "left" });

    doc.moveDown(0.3);

    doc.fontSize(12)
      .font("Helvetica")
      .text(`${data.role || ""}`)
      .moveDown(0.5);

    doc.text(`Total Experience: ${data.total_experience || "-"}`);

    doc.moveDown(1);

    // Divider line
    doc.moveTo(40, doc.y)
      .lineTo(doc.page.width - 40, doc.y)
      .stroke();

    doc.moveDown(1);

    // Sections in professional order

    renderSection(doc, "Professional Summary", data.professional_summary);

    renderSection(doc, "Skills",data.skills    
    );

    renderSection(doc, "Work Experience",data.work_experience  
    );

    renderSection(doc, "Projects",
      normalizePointsToNumbered(data.projects)
    
    );  

    renderSection(doc, "Education", data.education);


    doc.end();
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "PDF generation failed" });
  }
};


/* ================= formated resume word ================= */
/* ================= WORD GENERATION ================= */
export const generateFormattedResumeWord = async (req, res) => {
  try {
    const data = req.body;
    const children = [];

    /* ================= LOGO (TOP RIGHT) ================= */

    const logoPath = path.join(
      process.cwd(),
      "src",
      "assest",
      "logo.png"
    );    

    // spacing after logo
    children.push(new Paragraph({ text: "" }));
    children.push(new Paragraph({ text: "" }));

    /* ================= HEADER ================= */

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: data.name || "",
            bold: true,
            size: 32,
          }),
        ],
      })
    );

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: data.role || "",
          }),
        ],
      })
    );

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Total Experience: ${data.total_experience || "-"}`,
          }),
        ],
      })
    );

    children.push(new Paragraph({ text: "" }));
    children.push(new Paragraph({ text: "" }));

    /* ================= SECTION HELPER ================= */

    function cleanText(text) {
      if (!text) return "";

      return text
        .replace(/-\s+/g, "")     // fix broken words
        .replace(/\r/g, "")
        .trim();
    }

    const addSection = (title, content) => {
      if (!content || content.trim() === "") return;

      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: title.toUpperCase(),
              bold: true,
              size: 26,
            }),
          ],
          spacing: {
            before: 300,
            after: 200,
          },
        })
      );


      children.push(new Paragraph({ text: "" }));

      const cleaned = cleanText(content);
      const lines = cleaned.split("\n");

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const isRole = trimmed.toLowerCase().startsWith("role:");

        const isCompanyLine =
          /\d{4}/.test(trimmed) ||
          trimmed.toLowerCase().includes("present") ||
          trimmed.toLowerCase().includes("pvt") ||
          trimmed.toLowerCase().includes("ltd");

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: trimmed,
                bold: isRole,
                size: 22,
              }),
            ],
            spacing: {
              after: isCompanyLine ? 250 : 120,
            },
          })
        );
      });


      children.push(new Paragraph({ text: "" }));
    };


    /* ================= ADD SECTIONS ================= */

    addSection("Professional Summary", data.professional_summary);
    addSection("Skills", data.skills);
    addSection("Work Experience", data.work_experience);
    addSection("Projects", data.projects,
      normalizePointsToNumbered(data.projects)
    );
    addSection("Education", data.education);

    /* ================= BUILD DOC ================= */

    

    let header;

    if (fs.existsSync(logoPath)) {
      header = new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new ImageRun({
                data: fs.readFileSync(logoPath),
                transformation: {
                  width: 120,
                  height: 60,
                },
              }),
            ],
          }),
        ],
      });
    }

    const doc = new Document({
      sections: [
        {
          headers: {
            default: header,
          },
          children: children,
        },
      ],
    });


    const buffer = await Packer.toBuffer(doc);
    
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Resume.docx"
    );

    res.send(buffer);

  } catch (err) {
    console.error("Word generation error:", err);
    res.status(500).json({ error: "Word generation failed" });
  }
};

function cleanText(text) {
  if (!text) return "";

  return text
    .replace(/-\s+/g, "")     // remove broken hyphen words
    .replace(/\s+/g, " ")
    .trim();
}


/* ================= HELPERS ================= */

function renderSection(doc, title, content) {
  if (!content || content.trim() === "") return;

  doc.moveDown(0.8);

  // Section Title
  doc.fontSize(15)
   .font("Helvetica-Bold")
   .fillColor("#000000")
   .text(title.toUpperCase(), {
     underline: false
   });

  doc.moveDown(0.2);

  // subtle divider line under heading
  doc.moveTo(40, doc.y)
    .lineTo(doc.page.width - 40, doc.y)
    .lineWidth(0.5)
    .stroke();

  doc.moveDown(0.4);


  doc.fontSize(12).font("Helvetica");

  // Preserve structure line-by-line
  const lines = content
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  lines.forEach((line, index) => {
    doc.text(line, {
      lineGap: 2
    });

    // 🔥 Add spacing after logical blocks
    if (
      line.match(/\d{4}/) ||              // Year detected
      line.toLowerCase().includes("present") ||
      line.toLowerCase().includes("pvt") ||
      line.toLowerCase().includes("ltd")
    ) {
      doc.moveDown(0.6);   // bigger spacing after company/year line
    } else {
      doc.moveDown(0.3);   // normal spacing
    }
  });

  doc.moveDown(0.5);
}


function wordSection(title, content) {
  if (!content) return [];

  const lines = content
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const section = [];

  section.push(
    new Paragraph({
      children: [
        new TextRun({
          text: title.toUpperCase(),
          bold: true,
          size: 26
        })
      ],
      spacing: { before: 300, after: 200 }
    })
  );

  lines.forEach(line => {
    section.push(
      new Paragraph({
        children: [
          new TextRun({
            text: line,
            size: 22
          })
        ],
        spacing: { after: 150 }
      })
    );
  });

  return section;
}

function extractJSON(text) {
  if (!text) throw new Error("Empty AI response");

  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("Invalid JSON from AI");
  }

  const jsonSnippet = cleaned.substring(start, end + 1);

  try {
    return JSON.parse(jsonSnippet);
  } catch (err) {
    // If parse fails due to control characters, escape them and retry
    const escaped = jsonSnippet.replace(/[\u0000-\u001F]/g, (c) => {
      return "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0");
    });

    try {
      return JSON.parse(escaped);
    } catch (err2) {
      console.error("extractJSON: failed to parse AI response");
      console.error("Original response (trimmed):", cleaned);
      console.error("JSON snippet:", jsonSnippet);
      console.error("Escaped snippet:", escaped);
      throw new Error("Failed to parse JSON from AI response: " + err2.message);
    }
  }
}

/* ================= OTHER EXISTING FEATURES (UNCHANGED) ================= */
export const parseResumeController = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Resume file missing" });
    }

    // 🔥 IMPORTANT CHANGE
    const parsedData = await parseResume(
      req.file.buffer,
      req.file.mimetype
    );

    res.json(parsedData);

  } catch (err) {
    console.error("Resume parsing error:", err);
    res.status(500).json({ error: "Resume parsing failed" });
  }
};

// export const parseResumeController = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: "Resume file missing" });
//     }
//     const parsedData = await parseResume(req.file.path);
//     res.json(parsedData);
//   } catch (err) {
//     console.error("Resume parsing error:", err);
//     res.status(500).json({ error: "Resume parsing failed" });
//   }
// };

export const analyzeResumeForJD = async (req, res) => {
  try {
    const { resumeText, jobDescription } = req.body;

    if (!resumeText || !jobDescription) {
      return res.status(400).json({
        error: "resumeText and jobDescription are required",
      });
    }

    const prompt = `
Return ONLY JSON:
{
  "matchScore": 0,
  "strengths": [],
  "missingSkills": [],
  "recommendation": ""
}

JOB DESCRIPTION:
${jobDescription}

RESUME:
${resumeText}
`;

    const result = await ai.generateContent(prompt);
    const analysis = extractJSON(result.response.text());

    res.json({ success: true, analysis });
  } catch (err) {
    console.error("Resume analysis error:", err.message);
    res.status(500).json({ error: "Resume analysis failed" });
  }
};

export const getJDSuggestionsForResume = async (req, res) => {
  try {
    const { jobDescription } = req.body;
    if (!jobDescription) {
      return res.status(400).json({ error: "jobDescription is required" });
    }

    const prompt = `
Return ONLY JSON:
{
  "jobTitles": [],
  "primarySkills": [],
  "secondarySkills": [],
  "toolsAndTechnologies": [],
  "booleanSearch": "",
  "naukriTags": []
}

JOB DESCRIPTION:
${jobDescription}
`;

    const result = await ai.generateContent(prompt);
    const suggestions = extractJSON(result.response.text());

    res.json({ success: true, suggestions });
  } catch (err) {
    console.error("JD suggestion error:", err.message);
    res.status(500).json({ error: "JD suggestions failed" });
  }
};

export const getInterviewTips = async (req, res) => {
  try {
    const { position, candidateName } = req.body;

    if (!position) {
      return res.status(400).json({ error: "position is required" });
    }

    const prompt = `
Return ONLY JSON:
{
  "technicalQuestions": [],
  "behavioralQuestions": [],
  "preparationTips": [],
  "whatToExpect": ""
}

Position: ${position}
Candidate: ${candidateName || "Candidate"}
`;

    const result = await ai.generateContent(prompt);
    const tips = extractJSON(result.response.text());

    res.json({ success: true, tips });
  } catch (err) {
    console.error("Interview tips error:", err.message);
    res.status(500).json({ error: "Interview tips failed" });
  }
};

// import path from "path";
// import fs from "fs";
// import PDFDocument from "pdfkit";
// import extractResumeText from "../utils/resumeExtractor.js";
// import { ai } from "../config/gemini.js";
// import { parseResume } from "../services/documentAI.js"; // if used elsewhere

// /* ================= EXTRACT FIELDS USING AI ================= */

// async function extractFieldsWithAI(resumeText) {
//   const prompt = `
// Extract resume details.

// Return ONLY JSON:
// {
//   "name": "",
//   "role": "",
//   "total_experience": "",
//   "objective": "",
//   "professional_summary": "",
//   "work_experience": "",
//   "projects": "",
//   "education": ""
// }

// RESUME TEXT:
// ${resumeText}
// `;

//   const result = await ai.generateContent(prompt);
//   const text = result.response.text();

//   return extractJSON(text);
// }

// /* ================= STEP 1: UPLOAD → EXTRACT → RETURN JSON ================= */

// export const convertResumeFormatController = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: "Resume file missing" });
//     }

//     const buffer = fs.readFileSync(req.file.path);
//     const resumeText = await extractResumeText(buffer);
//     const fields = await extractFieldsWithAI(resumeText);

//     // ❗ DO NOT CREATE PDF HERE
//     res.json({
//       success: true,
//       fields,
//     });

//   } catch (err) {
//     console.error("Resume extraction error:", err);
//     res.status(500).json({ error: "Resume extraction failed" });
//   }
// };

// /* ================= STEP 2: GENERATE PDF FROM EDITED DATA ================= */
// export const generateFormattedResumePDF = async (req, res) => {
//   try {
//     const data = req.body;

//     res.setHeader("Content-Type", "application/pdf");
//     res.setHeader(
//       "Content-Disposition",
//       "attachment; filename=Resume.pdf"
//     );

//     const doc = new PDFDocument({ margin: 40 });
//     doc.pipe(res);

//     // LOGO
//     const logoPath = path.join(process.cwd(), "logo.png");
//     if (fs.existsSync(logoPath)) {
//       doc.image(logoPath, doc.page.width - 160, 20, { width: 120 });
//     }

//     doc.moveDown(2);

//     doc.fontSize(18).font("Helvetica-Bold").text(data.name || "");
//     doc.fontSize(14).font("Helvetica").text(data.role || "");
//     doc.fontSize(12).text(`Total Experience: ${data.total_experience || ""}`);
//     doc.moveDown();

//     section(doc, "Objective", data.objective);
//     section(doc, "Professional Summary", data.professional_summary);
//     section(doc, "Work Experience", data.work_experience);
//     section(doc, "Projects", data.projects);
//     section(doc, "Education", data.education);

//     doc.end();
//   } catch (err) {
//     console.error("PDF generation error:", err);
//     res.status(500).json({ error: "PDF generation failed" });
//   }
// };

// // export const generateFormattedResumePDF = async (req, res) => {
// //   try {
// //     const data = req.body;

// //     const outputDir = path.join(process.cwd(), "uploads/converted");
// //     if (!fs.existsSync(outputDir)) {
// //       fs.mkdirSync(outputDir, { recursive: true });
// //     }

// //     const fileName = `converted_${Date.now()}.pdf`;
// //     const filePath = path.join(outputDir, fileName);

// //     const doc = new PDFDocument({ margin: 40 });
// //     const stream = fs.createWriteStream(filePath);
// //     doc.pipe(stream);

// //     /* ===== LOGO ===== */
// //     const logoPath = path.join(process.cwd(), "logo.png");
// //     if (fs.existsSync(logoPath)) {
// //       doc.image(logoPath, doc.page.width - 160, 20, { width: 120 });
// //     }

// //     doc.moveDown(2);

// //     /* ===== CONTENT ===== */
// //     doc.fontSize(18).font("Helvetica-Bold").text(data.name || "");
// //     doc.fontSize(14).font("Helvetica").text(data.role || "");
// //     doc.fontSize(12).text(`Total Experience: ${data.total_experience || ""}`);
// //     doc.moveDown();

// //     section(doc, "Objective", data.objective);
// //     section(doc, "Professional Summary", data.professional_summary);
// //     section(doc, "Work Experience", data.work_experience);
// //     section(doc, "Projects", data.projects);
// //     section(doc, "Education", data.education);

// //     doc.end();

// //     stream.on("finish", () => {
// //       res.json({
// //         success: true,
// //         downloadUrl: `/uploads/converted/${fileName}`,
// //       });
// //     });

// //   } catch (err) {
// //     console.error("PDF generation error:", err);
// //     res.status(500).json({ error: "PDF generation failed" });
// //   }
// // };

// /* ================= HELPER ================= */

// function section(doc, title, content) {
//   doc.fontSize(13).font("Helvetica-Bold").text(title);
//   doc.font("Helvetica").fontSize(12).text(content || "-");
//   doc.moveDown();
// }

// function extractJSON(text) {
//   if (!text) throw new Error("Empty AI response");

//   const cleaned = text
//     .replace(/```json/gi, "")
//     .replace(/```/g, "")
//     .trim();

//   const start = cleaned.indexOf("{");
//   const end = cleaned.lastIndexOf("}");

//   if (start === -1 || end === -1) {
//     throw new Error("No JSON found in AI output");
//   }

//   return JSON.parse(cleaned.substring(start, end + 1));
// }

// /* ================= RESUME PARSE ================= */

// export const parseResumeController = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: "Resume file missing" });
//     }

//     const parsedData = await parseResume(req.file.path);
//     res.json(parsedData);
//   } catch (err) {
//     console.error("Resume parsing error:", err);
//     res.status(500).json({ error: "Resume parsing failed" });
//   }
// };

// /* ================= RESUME vs JD ================= */

// export const analyzeResumeForJD = async (req, res) => {
//   try {
//     const { resumeText, jobDescription } = req.body;

//     if (!resumeText || !jobDescription) {
//       return res.status(400).json({
//         error: "resumeText and jobDescription are required",
//       });
//     }

//     const prompt = `
// You are an ATS system.

// Return ONLY JSON:
// {
//   "matchScore": 0,
//   "strengths": [],
//   "missingSkills": [],
//   "recommendation": ""
// }

// JOB DESCRIPTION:
// ${jobDescription}

// RESUME:
// ${resumeText}
// `;

//     const result = await ai.generateContent(prompt);
//     const analysis = extractJSON(result.response.text());

//     res.json({ success: true, analysis });
//   } catch (error) {
//     console.error("Resume analysis error:", error.message);
//     res.status(500).json({
//       error: "Resume analysis failed",
//       details: error.message,
//     });
//   }
// };

// /* ================= JD SUGGESTIONS ================= */

// export const getJDSuggestionsForResume = async (req, res) => {
//   try {
//     const { jobDescription } = req.body;

//     if (!jobDescription) {
//       return res.status(400).json({ error: "jobDescription is required" });
//     }

//     const prompt = `
// Return ONLY JSON:
// {
//   "jobTitles": [],
//   "primarySkills": [],
//   "secondarySkills": [],
//   "toolsAndTechnologies": [],
//   "booleanSearch": "",
//   "naukriTags": []
// }

// JOB DESCRIPTION:
// ${jobDescription}
// `;

//     const result = await ai.generateContent(prompt);
//     const suggestions = extractJSON(result.response.text());

//     res.json({ success: true, suggestions });
//   } catch (error) {
//     console.error("JD suggestion error:", error.message);
//     res.status(500).json({
//       error: "JD suggestions failed",
//       details: error.message,
//     });
//   }
// };

// /* ================= INTERVIEW TIPS ================= */

// export const getInterviewTips = async (req, res) => {
//   try {
//     const { position, candidateName } = req.body;

//     if (!position) {
//       return res.status(400).json({ error: "position is required" });
//     }

//     const prompt = `
// Return ONLY JSON:
// {
//   "technicalQuestions": [],
//   "behavioralQuestions": [],
//   "preparationTips": [],
//   "whatToExpect": ""
// }

// Position: ${position}
// Candidate: ${candidateName || "Candidate"}
// `;

//     const result = await ai.generateContent(prompt);
//     const tips = extractJSON(result.response.text());

//     res.json({ success: true, tips });
//   } catch (error) {
//     console.error("Interview tips error:", error.message);
//     res.status(500).json({
//       error: "Interview tips failed",
//       details: error.message,
//     });
//   }
// };

// // import path from "path";
// // import fs from "fs";
// // import PDFDocument from "pdfkit";
// // import extractResumeText from "../utils/resumeExtractor.js";
// // import { ai } from "../config/gemini.js";

// // /* ================= EXTRACT FIELDS USING AI ================= */

// // async function extractFieldsWithAI(resumeText) {
// //   const prompt = `
// // Extract resume details.

// // Return ONLY JSON:
// // {
// //   "name": "",
// //   "role": "",
// //   "total_experience": "",
// //   "objective": "",
// //   "professional_summary": "",
// //   "work_experience": "",
// //   "projects": "",
// //   "education": ""
// // }

// // RESUME TEXT:
// // ${resumeText}
// // `;

// //   const result = await ai.generateContent(prompt);
// //   const text = result.response.text();

// //   return JSON.parse(
// //     text.replace(/```json|```/g, "").trim()
// //   );
// // }

// // /* ================= STEP 1: UPLOAD → EXTRACT → RETURN JSON ================= */

// // export const convertResumeFormatController = async (req, res) => {
// //   try {
// //     if (!req.file) {
// //       return res.status(400).json({ error: "Resume file missing" });
// //     }

// //     const buffer = fs.readFileSync(req.file.path);
// //     const resumeText = await extractResumeText(buffer);

// //     const fields = await extractFieldsWithAI(resumeText);

// //     // DO NOT CREATE PDF HERE
// //     res.json({
// //       success: true,
// //       fields
// //     });

// //   } catch (err) {
// //     console.error("Resume extraction error:", err);
// //     res.status(500).json({ error: "Resume extraction failed" });
// //   }
// // };

// // /* ================= STEP 2: GENERATE PDF FROM EDITED DATA ================= */

// // export const generateFormattedResumePDF = async (req, res) => {
// //   try {
// //     const data = req.body;

// //     const outputDir = path.join(process.cwd(), "uploads/converted");
// //     if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// //     const fileName = `converted_${Date.now()}.pdf`;
// //     const filePath = path.join(outputDir, fileName);

// //     const doc = new PDFDocument({ margin: 40 });
// //     const stream = fs.createWriteStream(filePath);
// //     doc.pipe(stream);

// //     // Logo
// //     const logoPath = path.join(process.cwd(), "logo.png");
// //     if (fs.existsSync(logoPath)) {
// //       doc.image(logoPath, doc.page.width - 160, 20, { width: 120 });
// //     }

// //     doc.moveDown(2);

// //     doc.fontSize(18).font("Helvetica-Bold").text(data.name);
// //     doc.fontSize(14).text(data.role);
// //     doc.fontSize(12).text(`Total Experience: ${data.total_experience}`);
// //     doc.moveDown();

// //     doc.fontSize(13).font("Helvetica-Bold").text("Objective");
// //     doc.font("Helvetica").text(data.objective);
// //     doc.moveDown();

// //     doc.font("Helvetica-Bold").text("Professional Summary");
// //     doc.font("Helvetica").text(data.professional_summary);
// //     doc.moveDown();

// //     doc.font("Helvetica-Bold").text("Work Experience");
// //     doc.font("Helvetica").text(data.work_experience);
// //     doc.moveDown();

// //     doc.font("Helvetica-Bold").text("Projects");
// //     doc.font("Helvetica").text(data.projects);
// //     doc.moveDown();

// //     doc.font("Helvetica-Bold").text("Education");
// //     doc.font("Helvetica").text(data.education);

// //     doc.end();

// //     stream.on("finish", () => {
// //       res.json({
// //         success: true,
// //         downloadUrl: `/uploads/converted/${fileName}`
// //       });
// //     });

// //   } catch (err) {
// //     console.error("PDF generation error:", err);
// //     res.status(500).json({ error: "PDF generation failed" });
// //   }
// // };



// // /* ================= HELPER ================= */

// // function extractJSON(text) {
// //   if (!text) throw new Error('Empty AI response');

// //   const cleaned = text
// //     .replace(/```json/gi, '')
// //     .replace(/```/g, '')
// //     .trim();

// //   const start = cleaned.indexOf('{');
// //   const end = cleaned.lastIndexOf('}');

// //   if (start === -1 || end === -1) {
// //     throw new Error('No JSON found in AI output');
// //   }

// //   return JSON.parse(cleaned.substring(start, end + 1));
// // }

// // /* ================= RESUME PARSE ================= */

// // export const parseResumeController = async (req, res) => {
// //   try {
// //     if (!req.file) {
// //       return res.status(400).json({ error: 'Resume file missing' });
// //     }

// //     const parsedData = await parseResume(req.file.path);
// //     res.json(parsedData);
// //   } catch (err) {
// //     console.error('Resume parsing error:', err);
// //     res.status(500).json({ error: 'Resume parsing failed' });
// //   }
// // };

// // /* ================= RESUME vs JD ANALYSIS ================= */

// // export const analyzeResumeForJD = async (req, res) => {
// //   try {
// //     const { resumeText, jobDescription } = req.body;

// //     if (!resumeText || !jobDescription) {
// //       return res.status(400).json({
// //         error: 'resumeText and jobDescription are required',
// //       });
// //     }

// //     const prompt = `
// // You are an ATS system.

// // Analyze the resume against the job description.

// // Return ONLY JSON:
// // {
// //   "matchScore": 0,
// //   "strengths": [],
// //   "missingSkills": [],
// //   "recommendation": ""
// // }

// // JOB DESCRIPTION:
// // ${jobDescription}

// // RESUME:
// // ${resumeText}
// // `;

// //     const result = await ai.generateContent(prompt);
// //     const output = result.response.text();

// //     const analysis = extractJSON(output);

// //     res.json({ success: true, analysis });
// //   } catch (error) {
// //     console.error('Resume analysis error:', error.message);
// //     res.status(500).json({
// //       error: 'Resume analysis failed',
// //       details: error.message,
// //     });
// //   }
// // };

// // /* ================= JD SUGGESTIONS ================= */

// // export const getJDSuggestionsForResume = async (req, res) => {
// //   try {
// //     const { jobDescription } = req.body;

// //     if (!jobDescription) {
// //       return res.status(400).json({ error: 'jobDescription is required' });
// //     }

// //     const prompt = `
// // Generate Naukri keywords.

// // Return ONLY JSON:
// // {
// //   "jobTitles": [],
// //   "primarySkills": [],
// //   "secondarySkills": [],
// //   "toolsAndTechnologies": [],
// //   "booleanSearch": "",
// //   "naukriTags": []
// // }

// // JOB DESCRIPTION:
// // ${jobDescription}
// // `;

// //     const result = await ai.generateContent(prompt);
// //     const output = result.response.text();

// //     const suggestions = extractJSON(output);

// //     res.json({ success: true, suggestions });
// //   } catch (error) {
// //     console.error('JD suggestion error:', error.message);
// //     res.status(500).json({
// //       error: 'JD suggestions failed',
// //       details: error.message,
// //     });
// //   }
// // };

// // /* ================= INTERVIEW TIPS ================= */

// // export const getInterviewTips = async (req, res) => {
// //   try {
// //     const { position, candidateName } = req.body;

// //     if (!position) {
// //       return res.status(400).json({ error: 'position is required' });
// //     }

// //     const prompt = `
// // Generate interview tips in JSON:
// // {
// //   "technicalQuestions": [],
// //   "behavioralQuestions": [],
// //   "preparationTips": [],
// //   "whatToExpect": ""
// // }

// // Position: ${position}
// // Candidate: ${candidateName || 'Candidate'}
// // `;

// //     const result = await ai.generateContent(prompt);
// //     const output = result.response.text();

// //     const tips = extractJSON(output);

// //     res.json({ success: true, tips });
// //   } catch (error) {
// //     console.error('Interview tips error:', error.message);
// //     res.status(500).json({
// //       error: 'Interview tips failed',
// //       details: error.message,
// //     });
// //   }
// // };

// // // import { parseResume } from '../services/documentAI.js';
// // // import { ai } from '../config/gemini.js';

// // // /* ================= HELPER ================= */

// // // /**
// // //  * Extract valid JSON from AI text safely
// // //  */
// // // function extractJSON(text) {
// // //   if (!text) throw new Error('Empty AI response');

// // //   // Remove ```json ``` or ``` wrappers
// // //   const cleaned = text
// // //     .replace(/```json/gi, '')
// // //     .replace(/```/g, '')
// // //     .trim();

// // //   // Extract JSON object
// // //   const firstBrace = cleaned.indexOf('{');
// // //   const lastBrace = cleaned.lastIndexOf('}');

// // //   if (firstBrace === -1 || lastBrace === -1) {
// // //     throw new Error('No JSON object found in AI response');
// // //   }

// // //   const jsonString = cleaned.substring(firstBrace, lastBrace + 1);
// // //   return JSON.parse(jsonString);
// // // }

// // // /* ================= RESUME PARSE ================= */

// // // export const parseResumeController = async (req, res) => {
// // //   try {
// // //     if (!req.file) {
// // //       return res.status(400).json({ error: 'Resume file missing' });
// // //     }

// // //     const parsedData = await parseResume(req.file.path);
// // //     res.json(parsedData);
// // //   } catch (err) {
// // //     console.error('Resume parsing error:', err);
// // //     res.status(500).json({ error: 'Resume parsing failed' });
// // //   }
// // // };

// // // /* ================= RESUME vs JD ANALYSIS ================= */

// // // export const analyzeResumeForJD = async (req, res) => {
// // //   try {
// // //     const { resumeText, jobDescription } = req.body;

// // //     if (!resumeText || !jobDescription) {
// // //       return res.status(400).json({
// // //         error: 'resumeText and jobDescription are required',
// // //       });
// // //     }

// // //     const prompt = `
// // // You are a senior HR recruiter.

// // // Analyze the resume against the job description.

// // // Return ONLY JSON in this format:
// // // {
// // //   "matchScore": 0,
// // //   "strengths": [],
// // //   "missingSkills": [],
// // //   "recommendation": ""
// // // }

// // // JOB DESCRIPTION:
// // // ${jobDescription}

// // // RESUME:
// // // ${resumeText}
// // // `;

// // //     const result = await ai.generateContent(prompt);
// // //     const output = result.response.text();

// // //     const analysis = extractJSON(output);

// // //     res.json({
// // //       success: true,
// // //       analysis,
// // //     });
// // //   } catch (error) {
// // //     console.error('Resume analysis error:', error.message);
// // //     res.status(500).json({
// // //       error: 'Resume analysis failed',
// // //       details: error.message,
// // //     });
// // //   }
// // // };

// // // /* ================= JD → NAUKRI SUGGESTIONS ================= */

// // // export const getJDSuggestionsForResume = async (req, res) => {
// // //   try {
// // //     const { jobDescription } = req.body;

// // //     if (!jobDescription) {
// // //       return res.status(400).json({ error: 'jobDescription is required' });
// // //     }

// // //     const prompt = `
// // // Generate Naukri search keywords.

// // // Return ONLY JSON:
// // // {
// // //   "jobTitles": [],
// // //   "primarySkills": [],
// // //   "secondarySkills": [],
// // //   "toolsAndTechnologies": [],
// // //   "booleanSearch": "",
// // //   "naukriTags": []
// // // }

// // // JOB DESCRIPTION:
// // // ${jobDescription}
// // // `;

// // //     const result = await ai.generateContent(prompt);
// // //     const output = result.response.text();

// // //     const suggestions = extractJSON(output);

// // //     res.json({
// // //       success: true,
// // //       suggestions,
// // //     });
// // //   } catch (error) {
// // //     console.error('JD suggestion error:', error.message);
// // //     res.status(500).json({
// // //       error: 'JD suggestions failed',
// // //       details: error.message,
// // //     });
// // //   }
// // // };

// // // /* ================= INTERVIEW TIPS ================= */

// // // export const getInterviewTips = async (req, res) => {
// // //   try {
// // //     const { position, candidateName } = req.body;

// // //     if (!position) {
// // //       return res.status(400).json({ error: 'position is required' });
// // //     }

// // //     const prompt = `
// // // Generate interview tips in JSON only:
// // // {
// // //   "technicalQuestions": [],
// // //   "behavioralQuestions": [],
// // //   "preparationTips": [],
// // //   "whatToExpect": ""
// // // }

// // // Position: ${position}
// // // Candidate: ${candidateName || 'Candidate'}
// // // `;

// // //     const result = await ai.generateContent(prompt);
// // //     const output = result.response.text();

// // //     const tips = extractJSON(output);

// // //     res.json({
// // //       success: true,
// // //       tips,
// // //     });
// // //   } catch (error) {
// // //     console.error('Interview tips error:', error.message);
// // //     res.status(500).json({
// // //       error: 'Interview tips failed',
// // //       details: error.message,
// // //     });
// // //   }
// // // };

// // // // import { parseResume } from '../services/documentAI.js';
// // // // import { ai } from '../config/gemini.js';

// // // // /**
// // // //  * Resume parsing using Document AI
// // // //  */
// // // // export const parseResumeController = async (req, res) => {
// // // //   try {
// // // //     if (!req.file) {
// // // //       return res.status(400).json({ error: 'Resume file missing' });
// // // //     }

// // // //     const parsedData = await parseResume(req.file.path);
// // // //     res.json(parsedData);
// // // //   } catch (err) {
// // // //     console.error('Resume parsing error:', err);
// // // //     res.status(500).json({ error: 'Resume parsing failed' });
// // // //   }
// // // // };

// // // // /**
// // // //  * Resume vs Job Description analysis (Gemini)
// // // //  */
// // // // export const analyzeResumeForJD = async (req, res) => {
// // // //   try {
// // // //     const { resumeText, jobDescription } = req.body;

// // // //     if (!resumeText || !jobDescription) {
// // // //       return res.status(400).json({
// // // //         error: 'resumeText and jobDescription are required',
// // // //       });
// // // //     }

// // // //     const prompt = `
// // // // You are a senior HR recruiter.

// // // // Analyze the resume against the job description.

// // // // Return ONLY valid JSON:
// // // // {
// // // //   "matchScore": 0.0,
// // // //   "strengths": [],
// // // //   "missingSkills": [],
// // // //   "recommendation": ""
// // // // }

// // // // JOB DESCRIPTION:
// // // // ${jobDescription}

// // // // RESUME:
// // // // ${resumeText}
// // // // `;

// // // //     const result = await ai.generateContent(prompt);
// // // //     const output = result.response.text();

// // // //     res.json({
// // // //       success: true,
// // // //       analysis: JSON.parse(output),
// // // //     });
// // // //   } catch (error) {
// // // //     console.error('Resume analysis error:', error);
// // // //     res.status(500).json({ error: error.message });
// // // //   }
// // // // };

// // // // /**
// // // //  * JD → Naukri keyword suggestions
// // // //  */
// // // // export const getJDSuggestionsForResume = async (req, res) => {
// // // //   try {
// // // //     const { jobDescription } = req.body;

// // // //     if (!jobDescription) {
// // // //       return res.status(400).json({ error: 'jobDescription is required' });
// // // //     }

// // // //     const prompt = `
// // // // Generate Naukri search keywords in JSON only:

// // // // {
// // // //   "jobTitles": [],
// // // //   "primarySkills": [],
// // // //   "secondarySkills": [],
// // // //   "toolsAndTechnologies": [],
// // // //   "booleanSearch": "",
// // // //   "naukriTags": []
// // // // }

// // // // JOB DESCRIPTION:
// // // // ${jobDescription}
// // // // `;

// // // //     const result = await ai.generateContent(prompt);
// // // //     const text = result.response.text().replace(/```json|```/g, '').trim();

// // // //     res.json({
// // // //       success: true,
// // // //       suggestions: JSON.parse(text),
// // // //     });
// // // //   } catch (error) {
// // // //     console.error('JD suggestion error:', error);
// // // //     res.status(500).json({ error: error.message });
// // // //   }
// // // // };

// // // // /**
// // // //  * Interview preparation tips
// // // //  */
// // // // export const getInterviewTips = async (req, res) => {
// // // //   try {
// // // //     const { position, candidateName } = req.body;

// // // //     const prompt = `
// // // // Generate interview tips in JSON:

// // // // {
// // // //   "technicalQuestions": [],
// // // //   "behavioralQuestions": [],
// // // //   "preparationTips": [],
// // // //   "whatToExpect": ""
// // // // }

// // // // Position: ${position}
// // // // Candidate: ${candidateName}
// // // // `;

// // // //     const result = await ai.generateContent(prompt);
// // // //     const output = result.response.text();

// // // //     res.json({
// // // //       success: true,
// // // //       tips: JSON.parse(output),
// // // //     });
// // // //   } catch (error) {
// // // //     console.error('Interview tips error:', error);
// // // //     res.status(500).json({ error: error.message });
// // // //   }
// // // // };
