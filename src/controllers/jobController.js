import pool from "../config/database.js"; // adjust path if needed

export const getJobs = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM jobs ORDER BY id DESC");
    res.json(rows);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
};

export const createJob = async (req, res) => {
  try {
    const {
      title,
      client_name,
      experience_required,
      location,
      notice_period,
      skills,
      job_description
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    const [result] = await pool.query(
      `INSERT INTO jobs 
      (title, client_name, experience_required, location, notice_period, skills, job_description)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        client_name,
        experience_required,
        location,
        notice_period,
        skills,
        job_description
      ]
    );

    res.status(201).json({ message: "Job created successfully" });
  } catch (error) {
    console.error("Error creating job:", error);
    res.status(500).json({ error: "Failed to create job" });
  }
};

export const deleteJob = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM jobs WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ message: 'Job removed' });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
};