import pool from '../config/database.js';
import { createAiInterviewSession } from '../services/aiInterviewService.js';
import { sendHRCalendarInvite } from '../utils/sendHRCalendarInvite.js';
import { sendMailViaGraph } from '../utils/sendMailGraph.js';
import { isAiInterviewer } from '../utils/aiInterview.js';
import {
  addMinutesToKolkataDateTimeString,
  toKolkataDateTimeString
} from '../utils/interviewDateTime.js';

/* ================= CREATE INTERVIEW ================= */
export const createInterview = async (req, res) => {
  try {
    const hrUser = req.user; // HR user who is scheduling the interview
    const {
      candidate_id,
      scheduled_date,
      interview_type,
      interviewer_department,
      resume_text,
      job_description,
      interviewers = [],
      teams_meeting_link
    } = req.body;

    if (!candidate_id || !scheduled_date || !interviewer_department || !Array.isArray(interviewers) || interviewers.length === 0) {
      return res.status(400).json({ error: "Candidate ID, scheduled date, department, and at least one interviewer are required" });
    }

    // Get candidate details
    const [candidateRows] = await pool.query(
      "SELECT custom_first_name, custom_last_name, email_id FROM candidates WHERE id = ?",
      [candidate_id]
    );
    if (!candidateRows.length) {
      return res.status(404).json({ error: "Candidate not found" });
    }


    // Get candidate details for email/calendar
    const candidate = candidateRows[0];
    const candidateName = `${candidate.custom_first_name} ${candidate.custom_last_name}`;
    const candidateEmail = candidate.email_id;

    // Create interview record for each interviewer and collect their emails
    const createdInterviewIds = [];
    const interviewerEmails = [];
    let aiInterviewRecord = null;
    for (const intv of interviewers) {
      const [result] = await pool.query(
        `INSERT INTO interviews
         (candidate_id, scheduled_date, interview_type,
          interviewer_name, interviewer_email,
          interviewer_role, interviewer_department, meeting_link, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
        [
          candidate_id,
          scheduled_date,
          interview_type,
          intv.interviewer_name,
          intv.interviewer_email || null,
          intv.interviewer_role || null,
          interviewer_department,
          teams_meeting_link || null
        ]
      );
      createdInterviewIds.push(result.insertId);
      if (intv.interviewer_email) {
        interviewerEmails.push(intv.interviewer_email);
      }
      if (!aiInterviewRecord && isAiInterviewer(intv)) {
        aiInterviewRecord = {
          interviewId: result.insertId,
          interviewer: intv
        };
      }
    }

    // Prepare email/calendar details
    const allInterviewerNames = interviewers.map(i => i.interviewer_name).join(', ');
    const meetingLink = teams_meeting_link || '';
    const startDateTime = toKolkataDateTimeString(scheduled_date);
    const endDateTime = addMinutesToKolkataDateTimeString(startDateTime, 30);
    const calendarWarnings = [];
    let aiInterviewSession = null;

    if (aiInterviewRecord) {
      try {
        aiInterviewSession = await createAiInterviewSession({
          candidateName,
          candidateEmail,
          interviewType: interview_type,
          scheduledAt: startDateTime,
          resumeText: resume_text || null,
          jobDescription: job_description || null,
          meetingJoinUrl: meetingLink || null,
          hrEmail: hrUser?.email || null,
          interviewers,
        });

        await pool.query(
          `INSERT INTO ai_interview_sessions
           (interview_id, external_session_id, provider, bot_identity, meeting_join_url, status)
           VALUES (?, ?, 'teams-bot', ?, ?, 'scheduled')`,
          [
            aiInterviewRecord.interviewId,
            aiInterviewSession.session_id,
            aiInterviewRecord.interviewer.interviewer_email || aiInterviewRecord.interviewer.interviewer_name || "UTSBOT",
            meetingLink || null,
          ]
        );
      } catch (aiInterviewError) {
        console.warn("AI interview session setup failed:", aiInterviewError.message);
        calendarWarnings.push({
          recipient: aiInterviewRecord.interviewer.interviewer_email || aiInterviewRecord.interviewer.interviewer_name || "UTSBOT",
          reason: `AI interview setup failed: ${aiInterviewError.message}`
        });
      }
    }

    // Send email and calendar invite to all interviewers
    for (const intv of interviewers) {
      if (intv.interviewer_email) {
        // Send email
        await sendMailViaGraph({
          to: intv.interviewer_email,
          subject: `Interview Scheduled: ${candidateName}`,
          html: `<p>Dear ${intv.interviewer_name},</p>
            <p>You have been scheduled to interview <strong>${candidateName}</strong> for the position of <strong>${interview_type}</strong> on <strong>${scheduled_date}</strong>.</p>
            <p>Meeting Link: <a href="${meetingLink}">${meetingLink}</a></p>
            <p>All Interviewers: ${allInterviewerNames}</p>
            <p>Candidate Email: ${candidateEmail}</p>`
        });
        // Send calendar invite
        try {
          await sendHRCalendarInvite({
            hrEmail: intv.interviewer_email,
            subject: `Interview Scheduled: ${candidateName}`,
            startDateTime,
            endDateTime,
            candidateName,
            interviewType: interview_type,
            interviewerName: intv.interviewer_name,
            candidateEmail,
            teamsMeetingLink: meetingLink
          });
        } catch (calendarError) {
          console.warn(`Calendar invite failed for interviewer ${intv.interviewer_email}:`, calendarError.message);
          calendarWarnings.push({
            recipient: intv.interviewer_email,
            reason: calendarError.message
          });
        }
      }
    }

    // Send email and calendar invite to candidate
    await sendMailViaGraph({
      to: candidateEmail,
      subject: `Your Interview is Scheduled` ,
      html: `<p>Dear ${candidateName},</p>
        <p>Your interview has been scheduled for <strong>${scheduled_date}</strong> with interviewer(s): <strong>${allInterviewerNames}</strong>.</p>
        <p>Meeting Link: <a href="${meetingLink}">${meetingLink}</a></p>
        <p>Best of luck!</p>`
    });
    try {
      await sendHRCalendarInvite({
        hrEmail: candidateEmail,
        subject: `Your Interview is Scheduled` ,
        startDateTime,
        endDateTime,
        candidateName,
        interviewType: interview_type,
        interviewerName: allInterviewerNames,
        candidateEmail,
        teamsMeetingLink: meetingLink
      });
    } catch (calendarError) {
      console.warn(`Calendar invite failed for candidate ${candidateEmail}:`, calendarError.message);
      calendarWarnings.push({
        recipient: candidateEmail,
        reason: calendarError.message
      });
    }

    // 🔥 AUTO STATUS UPDATE
    await pool.query(
      `UPDATE candidates SET status = 'l1_scheduled' WHERE id = ?`,
      [candidate_id]
    );

    res.status(201).json({
      ids: createdInterviewIds,
      message: 'Interview(s) scheduled, emails sent, calendar processed',
      calendarWarnings,
      aiInterview: aiInterviewSession
        ? {
            sessionId: aiInterviewSession.session_id,
            questionCount: aiInterviewSession.question_count,
            status: aiInterviewSession.status,
          }
        : null
    });
  } catch (err) {
    console.error('Create interview error:', err);
    res.status(500).json({ message: err.message });
  }
};

/* ================= HR INTERVIEW NOTIFICATION TEMPLATE ================= */
const hrInterviewNotificationTemplate = ({
  candidateName,
  candidateEmail,
  interviewDate,
  interviewer,
  interviewType,
  meetingLink
}) => `
  <table style="width: 100%; max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; background-color: #f5f5f5; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px; background-color: #1e3a8a; color: white; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">📅 Interview Scheduled</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 20px; background-color: white;">
        <p style="margin-top: 0; font-size: 14px; color: #333;">
          An interview has been scheduled and added to your calendar.
        </p>
        
        <div style="background-color: #f0f4f8; padding: 15px; border-left: 4px solid #1e3a8a; margin: 15px 0; border-radius: 4px;">
          <p style="margin: 8px 0;"><strong>👤 Candidate:</strong> ${candidateName}</p>
          <p style="margin: 8px 0;"><strong>📧 Email:</strong> <a href="mailto:${candidateEmail}">${candidateEmail}</a></p>
          <p style="margin: 8px 0;"><strong>📅 Date & Time:</strong> ${interviewDate}</p>
          <p style="margin: 8px 0;"><strong>🎯 Interview Type:</strong> ${interviewType}</p>
          <p style="margin: 8px 0;"><strong>👨‍💼 Interviewer:</strong> ${interviewer}</p>
          ${meetingLink ? `<p style="margin: 8px 0;"><strong>🔗 Meeting Link:</strong> <a href="${meetingLink}" style="color: #1e3a8a; text-decoration: none;">Join Teams Meeting</a></p>` : ''}
        </div>

        <p style="margin: 15px 0; font-size: 13px; color: #666;">
          ✅ A calendar event has been added to your Outlook calendar.
          <br/>⏰ You will receive a reminder 15 minutes before the interview.
        </p>

        <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
          <p style="margin: 0; font-size: 12px; color: #999;">HR Portal Interview Notification System</p>
        </div>
      </td>
    </tr>
  </table>
`;

/* ================= UPDATE STATUS ================= */
export const updateInterviewStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const interviewId = req.params.id;

    await pool.query(
      'UPDATE interviews SET status = ? WHERE id = ?',
      [status, interviewId]
    );

    const [[interview]] = await pool.query(
      'SELECT candidate_id FROM interviews WHERE id = ?',
      [interviewId]
    );

    const map = {
      scheduled: 'l1_scheduled',
      completed: 'l1_select',
      cancelled: 'screening_pending'
    };

    if (map[status]) {
      await pool.query(
        'UPDATE candidates SET status = ? WHERE id = ?',
        [map[status], interview.candidate_id]
      );
    }

    res.json({ message: 'Status updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================= GET ALL INTERVIEWS ================= */

export const getAllInterviews = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
          i.id,
          i.candidate_id,
          i.scheduled_date,
          i.interview_type,
          i.interviewer_name,
          i.interviewer_email,
          i.interviewer_role,
          i.interviewer_department,
          i.status,
          i.created_at,
          CONCAT(c.custom_first_name, ' ', c.custom_last_name) AS candidate_name,
          c.email_id AS candidate_email,
          c.position,
          c.status AS candidate_status
       FROM interviews i
       INNER JOIN candidates c ON i.candidate_id = c.id
       ORDER BY i.scheduled_date DESC
       LIMIT 5000`
    );

    res.json(rows);
  } catch (error) {
    console.error('❌ getAllInterviews error:', error);
    res.status(500).json({ error: error.message });
  }
};
/* ================= GET INTERVIEWS BY CANDIDATE ================= */

export const getByCandidate = async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM interviews WHERE candidate_id = ?',
    [req.params.id]
  );
  res.json(rows);
};
/* ================= UPDATE INTERVIEW ================= */

export const updateInterview = async (req, res) => {
  const {
    scheduled_date,
    interview_type,
    interviewer_id,
    status,
    feedback
  } = req.body;

  await pool.query(
    `UPDATE interviews SET
      scheduled_date = ?,
      interview_type = ?,
      interviewer_id = ?,
      status = ?,
      feedback = ?
     WHERE id = ?`,
    [
      scheduled_date,
      interview_type,
      interviewer_id,
      status,
      feedback,
      req.params.id
    ]
  );

  res.json({ message: 'Interview updated successfully' });
};


export const updateStatus = async (req, res) => {
  try {
    const { id: hrId, name: hrName } = req.user;
    const { interviewId } = req.params;
    const { status } = req.body;

    // 1️⃣ Get old status
    const [[oldRow]] = await pool.query(
      `SELECT status, candidate_id FROM interviews WHERE id = ?`,
      [interviewId]
    );

    // 2️⃣ Update interview status
    await pool.query(
      `UPDATE interviews SET status = ? WHERE id = ?`,
      [status, interviewId]
    );

    // 3️⃣ INSERT STATUS ACTIVITY LOG  🔥🔥🔥
    await pool.query(
      `
      INSERT INTO status_activity_logs
      (candidate_id, action, old_data, new_data, performed_by)
      VALUES (?, ?, ?, ?, ?)
      `,
      [
    oldRow.candidate_id,
    newStatus,            // action
    oldRow.status,        // old_data
    newStatus,            // new_data
    req.user.id           // HR id
  ]
    );

    res.json({ message: "Status updated & logged successfully" });

  } catch (err) {
    console.error("updateStatus error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
};

/* ================= GENERATE AI INTERVIEW LINK FOR CANDIDATE ================= */
export const generateInterviewLink = async (req, res) => {
  try {
    const {
      candidate_id,
      candidate_name,
      candidate_email,
      resume_text,
      job_description,
      interview_type = "AI HR Interview"
    } = req.body;

    if (!candidate_name || !candidate_email) {
      return res.status(400).json({ error: "Candidate name and email are required" });
    }

    // Call hr_ai_interview backend to create session
    const aiBackendUrl = process.env.AI_INTERVIEW_BACKEND_URL || "http://localhost:8000";
    
    const sessionPayload = {
      candidate_name,
      candidate_email,
      resume_text: resume_text || undefined,
      job_description: job_description || undefined,
      interview_type,
      scheduled_at: new Date().toISOString(),
      hr_email: req.user?.email || null,
      interviewers: []
    };

    const response = await fetch(`${aiBackendUrl}/api/v1/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionPayload)
    });

    if (!response.ok) {
      throw new Error(`AI backend error: ${response.statusText}`);
    }

    const sessionData = await response.json();
    const sessionId = sessionData.session_id;

    // Generate shareable link pointing to candidate interview app
    const candidateInterviewUrl = process.env.CANDIDATE_INTERVIEW_URL || "http://localhost:3001";
    const interviewLink = `${candidateInterviewUrl}/interview/${sessionId}`;

    // Also save to database for monitoring
    if (candidate_id) {
      try {
        await pool.query(
          `INSERT INTO ai_interview_sessions 
           (external_session_id, candidate_id, status, created_at)
           VALUES (?, ?, 'scheduled', NOW())
           ON DUPLICATE KEY UPDATE status = 'scheduled'`,
          [sessionId, candidate_id]
        );
      } catch (dbError) {
        console.warn("Failed to save session to database:", dbError.message);
      }
    }

    res.json({
      session_id: sessionId,
      interview_link: interviewLink,
      question_count: sessionData.question_count,
      status: sessionData.status,
      message: "Interview link generated successfully. Share this link with the candidate."
    });

  } catch (error) {
    console.error("Generate interview link error:", error);
    res.status(500).json({ error: error.message });
  }
};


/* ================= GET LIVE INTERVIEW SESSIONS (FOR HR MONITORING) ================= */
export const getLiveInterviewSessions = async (req, res) => {
  try {
    const aiBackendUrl = process.env.AI_INTERVIEW_BACKEND_URL || "http://localhost:8000";
    
    // Fetch all active sessions from AI backend
    const response = await fetch(`${aiBackendUrl}/api/v1/sessions-ready?within_minutes=480`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });

    if (!response.ok) {
      return res.status(200).json({ sessions: [], message: "No active sessions" });
    }

    const sessionsData = await response.json();
    const sessions = Array.isArray(sessionsData) ? sessionsData : sessionsData.sessions || [];

    // Enrich with database info if available
    const enrichedSessions = await Promise.all(
      sessions.map(async (session) => {
        try {
          const [dbRows] = await pool.query(
            `SELECT ais.*, c.custom_first_name, c.custom_last_name, c.email_id
             FROM ai_interview_sessions ais
             LEFT JOIN candidates c ON ais.candidate_id = c.id
             WHERE ais.external_session_id = ?`,
            [session.session_id]
          );
          
          if (dbRows.length > 0) {
            const dbSession = dbRows[0];
            return {
              ...session,
              candidate_name: session.candidate_name || `${dbSession.custom_first_name || ''} ${dbSession.custom_last_name || ''}`.trim(),
              candidate_email: session.candidate_email || dbSession.email_id,
              db_id: dbSession.id,
              current_question: session.current_question_index + 1,
              total_questions: session.questions?.length || 0,
              progress_percent: session.questions?.length ? Math.round(((session.current_question_index + 1) / session.questions.length) * 100) : 0
            };
          }
          return session;
        } catch (e) {
          console.warn("Error enriching session:", e.message);
          return session;
        }
      })
    );

    res.json({ sessions: enrichedSessions });
  } catch (error) {
    console.error("Get live sessions error:", error);
    res.status(500).json({ error: error.message });
  }
};


/* ================= GET INTERVIEW SESSION DETAILS ================= */
export const getInterviewSessionDetails = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const aiBackendUrl = process.env.AI_INTERVIEW_BACKEND_URL || "http://localhost:8000";

    // Fetch from AI backend
    const response = await fetch(`${aiBackendUrl}/api/v1/sessions/${sessionId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });

    if (!response.ok) {
      return res.status(404).json({ error: "Session not found" });
    }

    const sessionData = await response.json();

    // Enrich with database info
    try {
      const [dbRows] = await pool.query(
        `SELECT ais.*, c.custom_first_name, c.custom_last_name, c.email_id
         FROM ai_interview_sessions ais
         LEFT JOIN candidates c ON ais.candidate_id = c.id
         WHERE ais.external_session_id = ?`,
        [sessionId]
      );
      
      if (dbRows.length > 0) {
        const dbSession = dbRows[0];
        sessionData.candidate_name = sessionData.candidate_name || `${dbSession.custom_first_name || ''} ${dbSession.custom_last_name || ''}`.trim();
        sessionData.candidate_email = sessionData.candidate_email || dbSession.email_id;
        sessionData.db_id = dbSession.id;
      }
    } catch (e) {
      console.warn("Error enriching session details:", e.message);
    }

    res.json(sessionData);
  } catch (error) {
    console.error("Get session details error:", error);
    res.status(500).json({ error: error.message });
  }
};


/* ================= GET INTERVIEW REPORT ================= */
export const getInterviewReport = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const aiBackendUrl = process.env.AI_INTERVIEW_BACKEND_URL || "http://localhost:8000";

    // Fetch report from AI backend
    const response = await fetch(`${aiBackendUrl}/api/v1/sessions/${sessionId}/report`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });

    if (!response.ok) {
      return res.status(404).json({ error: "Report not found" });
    }

    const reportData = await response.json();
    res.json(reportData);
  } catch (error) {
    console.error("Get interview report error:", error);
    res.status(500).json({ error: error.message });
  }
};


// /* ================= UPDATE INTERVIEW STATUS (🔥 FIX HERE) ================= */

// export const updateInterviewStatus = async (req, res) => {
//   try {
//     const { status } = req.body;
//     const interviewId = req.params.id;

//     if (!status) {
//       return res.status(400).json({ message: 'Status is required' });
//     }

//     // 1️⃣ Update interview status
//     await pool.query(
//       'UPDATE interviews SET status = ? WHERE id = ?',
//       [status, interviewId]
//     );

//     // 2️⃣ Fetch candidate_id from interview
//     const [[interview]] = await pool.query(
//       'SELECT candidate_id FROM interviews WHERE id = ?',
//       [interviewId]
//     );

//     if (interview?.candidate_id) {
//       // 3️⃣ Update candidate status (🔥 THIS FIXES UI)
//       await pool.query(
//         'UPDATE candidates SET status = ? WHERE id = ?',
//         [status, interview.candidate_id]
//       );
//     }

//     res.json({ message: 'Interview & candidate status updated' });

//   } catch (err) {
//     console.error('❌ Update status error:', err);
//     res.status(500).json({ message: err.message });
//   }
// };


// import pool from '../config/database.js';

// /* ================= CREATE INTERVIEW ================= */

// export const createInterview = async (req, res) => {
//   try {
//     const {
//       candidate_id,
//       scheduled_date,
//       interview_type,
//       interviewer_name,
//       interviewer_email,
//       interviewer_role,
//       interviewer_department
//     } = req.body;

//     if (
//       !candidate_id ||
//       !scheduled_date ||
//       !interviewer_name ||
//       !interviewer_department

//     ) {
//       return res.status(400).json({ message: 'Missing required fields' });
//     }

//     const [result] = await pool.query(
//       `INSERT INTO interviews
//        (candidate_id, scheduled_date, interview_type,
//         interviewer_name, interviewer_email,
//         interviewer_role, interviewer_department, status)
//        VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
//       [
//         candidate_id,
//         scheduled_date,
//         interview_type,
//         interviewer_name,
//         interviewer_email || null,
//         interviewer_role || null,
//         interviewer_department
//       ]
//     );

//     res.status(201).json({
//       id: result.insertId,
//       message: 'Interview scheduled successfully'
//     });

//   } catch (err) {
//     console.error('❌ Create interview error:', err);
//     res.status(500).json({ message: err.message });
//   }
// };

// /* ================= GET INTERVIEWS BY CANDIDATE ================= */

// export const getByCandidate = async (req, res) => {
//   const [rows] = await pool.query(
//     'SELECT * FROM interviews WHERE candidate_id = ?',
//     [req.params.id]
//   );
//   res.json(rows);
// };

// /* ================= UPDATE INTERVIEW ================= */

// export const updateInterview = async (req, res) => {
//   const {
//     scheduled_date,
//     interview_type,
//     interviewer_id,
//     status,
//     feedback
//   } = req.body;

//   await pool.query(
//     `UPDATE interviews SET
//       scheduled_date = ?,
//       interview_type = ?,
//       interviewer_id = ?,
//       status = ?,
//       feedback = ?
//      WHERE id = ?`,
//     [
//       scheduled_date,
//       interview_type,
//       interviewer_id,
//       status,
//       feedback,
//       req.params.id
//     ]
//   );

//   res.json({ message: 'Interview updated successfully' });
// };

// /* ================= GET ALL INTERVIEWS ================= */

// export const getAllInterviews = async (req, res) => {
//   try {
//     const [rows] = await pool.query(
//       `SELECT 
//           i.id,
//           i.candidate_id,
//           i.scheduled_date,
//           i.interview_type,
//           i.interviewer_name,
//           i.interviewer_email,
//           i.interviewer_role,
//           i.interviewer_department,
//           i.status,
//           i.created_at,
//           CONCAT(c.custom_first_name, ' ', c.custom_last_name) AS candidate_name,
//           c.email_id AS candidate_email,
//           c.position,
//           c.status AS candidate_status
//        FROM interviews i
//        INNER JOIN candidates c ON i.candidate_id = c.id
//        ORDER BY i.scheduled_date DESC
//        LIMIT 5000`
//     );

//     res.json(rows);
//   } catch (error) {
//     console.error('❌ getAllInterviews error:', error);
//     res.status(500).json({ error: error.message });
//   }
// };

// /* ================= UPDATE INTERVIEW STATUS (🔥 FIX HERE) ================= */

// export const updateInterviewStatus = async (req, res) => {
//   try {
//     const { status } = req.body;
//     const interviewId = req.params.id;

//     if (!status) {
//       return res.status(400).json({ message: 'Status is required' });
//     }

//     // 1️⃣ Update interview status
//     await pool.query(
//       'UPDATE interviews SET status = ? WHERE id = ?',
//       [status, interviewId]
//     );

//     // 2️⃣ Fetch candidate_id from interview
//     const [[interview]] = await pool.query(
//       'SELECT candidate_id FROM interviews WHERE id = ?',
//       [interviewId]
//     );

//     if (interview?.candidate_id) {
//       // 3️⃣ Update candidate status (🔥 THIS FIXES UI)
//       await pool.query(
//         'UPDATE candidates SET status = ? WHERE id = ?',
//         [status, interview.candidate_id]
//       );
//     }

//     res.json({ message: 'Interview & candidate status updated' });

//   } catch (err) {
//     console.error('❌ Update status error:', err);
//     res.status(500).json({ message: err.message });
//   }
// };

// // import pool from '../config/database.js';

// // /* CREATE INTERVIEW */
// // // export const createInterview = async (req, res) => {
// // //   try {
// // //     const {
// // //       candidate_id,
// // //       scheduled_date,
// // //       interview_type,
// // //       interviewer_id
// // //     } = req.body;

// // //     console.log('📦 Interview payload:', req.body);

// // //     if (!candidate_id || !scheduled_date || !interviewer_id) {
// // //       return res.status(400).json({ message: 'Missing required fields' });
// // //     }

// // //     const [result] = await pool.query(
// // //       `INSERT INTO interviews
// // //        (candidate_id, scheduled_date, interview_type, interviewer_id, status)
// // //        VALUES (?, ?, ?, ?, 'scheduled')`,
// // //       [candidate_id, scheduled_date, interview_type, interviewer_id]
// // //     );

// // //     res.status(201).json({
// // //       id: result.insertId,
// // //       message: 'Interview scheduled successfully'
// // //     });
// // //   } catch (error) {
// // //     console.error('❌ Create interview error:', error);
// // //     res.status(500).json({ error: error.message });
// // //   }
// // // };


// // export const createInterview = async (req, res) => {
// //   try {
// //     const {
// //       candidate_id,
// //       scheduled_date,
// //       interview_type,
// //       interviewer_name,
// //       interviewer_email,
// //       interviewer_role,
// //       interviewer_department
// //     } = req.body;

// //     if (
// //       !candidate_id ||
// //       !scheduled_date ||
// //       !interviewer_name ||
// //       !interviewer_department
// //     ) {
// //       return res.status(400).json({ message: 'Missing required fields' });
// //     }

// //     const [result] = await pool.query(
// //       `INSERT INTO interviews
// //        (candidate_id, scheduled_date, interview_type,
// //         interviewer_name, interviewer_email,
// //         interviewer_role, interviewer_department, status)
// //        VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
// //       [
// //         candidate_id,
// //         scheduled_date,
// //         interview_type,
// //         interviewer_name,
// //         interviewer_email || null,
// //         interviewer_role || null,
// //         interviewer_department
// //       ]
// //     );

// //     res.status(201).json({
// //       id: result.insertId,
// //       message: 'Interview scheduled successfully'
// //     });

// //   } catch (err) {
// //     console.error('❌ Create interview error:', err);
// //     res.status(500).json({ message: err.message });
// //   }
// // };


// // /* GET INTERVIEWS BY CANDIDATE */
// // export const getByCandidate = async (req, res) => {
// //   const [rows] = await pool.query(
// //     'SELECT * FROM interviews WHERE candidate_id = ?',
// //     [req.params.id]
// //   );
// //   res.json(rows);
// // };

// // /* UPDATE INTERVIEW */
// // export const updateInterview = async (req, res) => {
// //   const {
// //     scheduled_date,
// //     interview_type,
// //     interviewer_id,
// //     status,
// //     feedback
// //   } = req.body;

// //   await pool.query(
// //     `UPDATE interviews SET
// //       scheduled_date = ?,
// //       interview_type = ?,
// //       interviewer_id = ?,
// //       status = ?,
// //       feedback = ?
// //      WHERE id = ?`,
// //     [
// //       scheduled_date,
// //       interview_type,
// //       interviewer_id,
// //       status,
// //       feedback,
// //       req.params.id
// //     ]
// //   );

// //   res.json({ message: 'Interview updated successfully' });
// // };

// // /* GET ALL INTERVIEWS */
// // // export const getAllInterviews = async (req, res) => {
// // //   const [rows] = await pool.query(
// // //     `SELECT i.*, 
// // //             c.first_name, c.last_name, c.email_id,
// // //             iv.name AS interviewer_name
// // //      FROM interviews i
// // //      JOIN candidates c ON i.candidate_id = c.id
// // //      LEFT JOIN interviewers iv ON i.interviewer_id = iv.id
// // //      ORDER BY i.scheduled_date`
// // //   );

// // //   res.json(rows);
// // // };

// // // import pool from '../config/database.js';

// // // /**
// // //  * Create interview
// // //  */
// // // export const createInterview = async (req, res) => {
// // //   try {
// // //     const {
// // //       candidate_id,
// // //       scheduled_date,
// // //       interview_type,
// // //       interviewer_name,
// // //     } = req.body;

// // //     console.log('📦 Interview payload:', req.body);

// // //     const [result] = await pool.query(
// // //       `INSERT INTO interviews
// // //        (candidate_id, scheduled_date, interview_type, interviewer_name, status)
// // //        VALUES (?, ?, ?, ?, ?)`,
// // //       [
// // //         candidate_id,
// // //         scheduled_date,
// // //         interview_type,
// // //         interviewer_name,
// // //         'scheduled',
// // //       ]
// // //     );

// // //     res.status(201).json({
// // //       message: 'Interview created successfully',
// // //       id: result.insertId,
// // //     });
// // //   } catch (error) {
// // //     console.error('❌ Create interview error:', error);
// // //     res.status(500).json({ error: error.message });
// // //   }
// // // };


// // // /**
// // //  * Get interviews by candidate
// // //  */
// // // export const getByCandidate = async (req, res) => {
// // //   try {
// // //     const [interviews] = await pool.query(
// // //       `SELECT * FROM interviews
// // //        WHERE candidate_id = ?
// // //        ORDER BY scheduled_date`,
// // //       [req.params.id]
// // //     );

// // //     res.json(interviews);
// // //   } catch (error) {
// // //     res.status(500).json({ error: error.message });
// // //   }
// // // };

// // // /**
// // //  * Update interview
// // //  */
// // // export const updateInterview = async (req, res) => {
// // //   try {
// // //     const {
// // //       scheduled_date,
// // //       interview_type,
// // //       interviewer_name,
// // //       // notes,
// // //       status,
// // //       feedback,
// // //     } = req.body;

// // //     await pool.query(
// // //       `UPDATE interviews SET
// // //         scheduled_date = ?,
// // //         interview_type = ?,
// // //         interviewer_name = ?,
// // //         // notes = ?,
// // //         status = ?,
// // //         feedback = ?
// // //       WHERE id = ?`,
// // //       [
// // //         scheduled_date,
// // //         interview_type,
// // //         interviewer_name,
// // //         // notes,
// // //         status,
// // //         feedback,
// // //         req.params.id,
// // //       ]
// // //     );

// // //     res.json({ message: 'Interview updated successfully' });
// // //   } catch (error) {
// // //     res.status(500).json({ error: error.message });
// // //   }
// // // };

// // // /**
// // //  * Get all interviews (admin view)
// // //  */
// // // export const getAllInterviews = async (req, res) => {
// // //   try {
// // //     const [interviews] = await pool.query(
// // //       `SELECT i.*,
// // //               CONCAT(c.custom_first_name, ' ', c.custom_last_name) AS candidate_name,
// // //               c.email_id AS candidate_email
// // //        FROM interviews i
// // //        JOIN candidates c ON i.candidate_id = c.id
// // //        ORDER BY i.scheduled_date`
// // //     );

// // //     res.json(interviews);
// // //   } catch (error) {
// // //     res.status(500).json({ error: error.message });
// // //   }
// // // };



// // // /* GET all interviewers */
// // // export const getInterviewers = async (req, res) => {
// // //   try {
// // //     const [rows] = await db.query(
// // //       'SELECT * FROM interviewers WHERE is_active = true'
// // //     );
// // //     res.json(rows);
// // //   } catch (err) {
// // //     console.error(err);
// // //     res.status(500).json({ message: 'Failed to fetch interviewers' });
// // //   }
// // // };

// // // /* ADD interviewer */
// // // export const createInterviewer = async (req, res) => {
// // //   try {
// // //     const { name } = req.body;

// // //     await db.query(
// // //       'INSERT INTO interviewers (name) VALUES (?)',
// // //       [name]
// // //     );

// // //     res.json({ message: 'Interviewer added' });
// // //   } catch (err) {
// // //     console.error(err);
// // //     res.status(500).json({ message: 'Failed to add interviewer' });
// // //   }
// // // };

// // // /* DELETE interviewer (soft delete) */
// // // export const deleteInterviewer = async (req, res) => {
// // //   try {
// // //     const { id } = req.params;

// // //     await db.query(
// // //       'UPDATE interviewers SET is_active = false WHERE id = ?',
// // //       [id]
// // //     );

// // //     res.json({ message: 'Interviewer removed' });
// // //   } catch (err) {
// // //     console.error(err);
// // //     res.status(500).json({ message: 'Failed to delete interviewer' });
// // //   }
// // // };
// // export const getAllInterviews = async (req, res) => {
// //   try {
// //     const [rows] = await pool.query(
// //       `SELECT 
// //           i.*,
// //           CONCAT(c.custom_first_name, ' ', c.custom_last_name) AS candidate_name,
// //           c.email_id AS candidate_email
// //        FROM interviews i
// //        JOIN candidates c ON i.candidate_id = c.id
// //        ORDER BY i.scheduled_date`
// //     );

// //     res.json(rows);
// //   } catch (error) {
// //     console.error('❌ getAllInterviews error:', error);
// //     res.status(500).json({ error: error.message });
// //   }
// // };

// // export const updateInterviewStatus = async (req, res) => {
// //   try {
// //     const { status } = req.body;

// //     if (!status) {
// //       return res.status(400).json({ message: 'Status is required' });
// //     }

// //     await pool.query(
// //       'UPDATE interviews SET status = ? WHERE id = ?',
// //       [status, req.params.id]
// //     );

// //     res.json({ message: 'Interview status updated' });
// //   } catch (err) {
// //     console.error('❌ Update status error:', err);
// //     res.status(500).json({ message: err.message });
// //   }
// // };
