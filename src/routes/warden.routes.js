import express from 'express';
import { exportOutingReport } from '../controllers/leave.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

router.use(protect);

// Outing reports
router.get('/outing/export', authorize('warden'), exportOutingReport);

export default router;
