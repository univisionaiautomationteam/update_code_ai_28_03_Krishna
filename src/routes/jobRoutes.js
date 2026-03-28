import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/adminMiddleware.js';
import { getJobs, createJob, deleteJob } from '../controllers/jobController.js';

const router = express.Router();

router.get('/', protect, getJobs);
router.post('/', protect, requireAdmin, createJob);
router.delete('/:id', protect, requireAdmin, deleteJob);

export default router; 