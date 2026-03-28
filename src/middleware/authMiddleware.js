import jwt from "jsonwebtoken";
import pool from "../config/database.js";

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [[user]] = await pool.query(
      "SELECT id, name, email, role FROM users WHERE id = ?",
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user; // 🔑 THIS IS WHAT YOU NEED
    next();
  } catch (err) {
    console.error("Auth error:", err);
    res.status(401).json({ message: "Invalid token" });
  }
};

// import jwt from 'jsonwebtoken';

// export const authMiddleware = (req, res, next) => {
//   const authHeader = req.headers.authorization;

//   if (!authHeader) {
//     return res.status(401).json({ message: 'Missing token' });
//   }

//   const token = authHeader.split(' ')[1];

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = decoded; // 🔥 THIS IS IMPORTANT
//     next();
//   } catch (err) {
//     return res.status(401).json({ message: 'Invalid token' });
//   }
// };
