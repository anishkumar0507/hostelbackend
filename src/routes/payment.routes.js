import express from 'express';
import { getPaymentSummary, payMyFees } from '../controllers/payment.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

/**
 * @route   GET /api/payments
 * @desc    Get payment summary for all students
 * @access  Private (Warden only)
 */
router.get('/', protect, authorize('warden'), getPaymentSummary);

/**
 * @route   POST /api/payments/pay
 * @desc    Record payment against student's pending fees (student or parent)
 * @access  Private (Student or Parent only)
 */
router.post('/pay', protect, authorize('student', 'parent'), payMyFees);

export default router;
