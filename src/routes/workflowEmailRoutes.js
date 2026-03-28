import express from "express";
import {
  getWorkflowEmails,
  saveWorkflowEmails
} from "../controllers/workflowEmailController.js";

import { protect } from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/adminMiddleware.js";

const router = express.Router();

/* GET ALL EMAILS */

router.get("/", protect, getWorkflowEmails);

/* SAVE EMAILS (ADMIN ONLY) */

router.post("/", protect, requireAdmin, saveWorkflowEmails);

export default router;