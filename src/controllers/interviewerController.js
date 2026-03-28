
import pool from '../config/database.js';

/* GET INTERVIEWERS */
export const getInterviewers = async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM interviewers WHERE is_active = true'
  );
  res.json(rows);
};

/* CREATE INTERVIEWER */
// export const createInterviewer = async (req, res) => {
//   const { name } = req.body;

//   if (!name) {
//     return res.status(400).json({ message: 'Name required' });
//   }

//   await pool.query(
//     'INSERT INTO interviewers (name) VALUES (?)',
//     [name]
//   );

//   res.json({ message: 'Interviewer added' });
// };
export const createInterviewer = async (req, res) => {
  try {
    console.log('📥 Received interviewer payload:', req.body);

    const { name, email, role, department } = req.body;

    if (!name || !role || !department) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    await pool.query(
      `INSERT INTO interviewers (name, email, role, department)
       VALUES (?, ?, ?, ?)`,
      [name, email || null, role, department]
    );

    res.json({ message: 'Interviewer added successfully' });
  } catch (err) {
    console.error('❌ Create interviewer error:', err);
    res.status(500).json({ message: err.message });
  }
};


/* DELETE INTERVIEWER */
export const deleteInterviewer = async (req, res) => {
  await pool.query(
    'UPDATE interviewers SET is_active = false WHERE id = ?',
    [req.params.id]
  );

  res.json({ message: 'Interviewer removed' });
};
