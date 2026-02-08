import Fee from '../models/Fee.model.js';
import Student from '../models/Student.model.js';
import Parent from '../models/Parent.model.js';
import Payment from '../models/Payment.model.js';

/**
 * @desc    Get payment summary for all students (warden only)
 * @route   GET /api/payments
 * @access  Private (Warden only)
 */
export const getPaymentSummary = async (req, res) => {
  try {
    // Get all students with their fees
    const students = await Student.find()
      .populate('userId', 'name email')
      .sort({ rollNumber: 1 });

    // Get all fees
    const allFees = await Fee.find().populate({
      path: 'studentId',
      select: 'rollNumber userId',
      populate: { path: 'userId', select: 'name' },
    });

    // Group fees by student and calculate totals
    const paymentSummary = students.map((student) => {
      const studentFees = allFees.filter(
        (fee) => fee.studentId._id.toString() === student._id.toString()
      );

      const totalFees = studentFees.reduce((sum, fee) => sum + fee.amount, 0);
      const paidAmount = studentFees
        .filter((fee) => fee.status === 'Paid')
        .reduce((sum, fee) => sum + fee.amount, 0);
      const dueAmount = totalFees - paidAmount;
      const paymentStatus = dueAmount === 0 ? 'Paid' : dueAmount === totalFees ? 'Pending' : 'Partial';

      return {
        studentId: student._id,
        studentName: student.userId?.name || 'Unknown',
        rollNumber: student.rollNumber,
        email: student.userId?.email || 'N/A',
        class: student.class,
        section: student.section || 'N/A',
        room: student.room || 'N/A',
        totalFees,
        paidAmount,
        dueAmount,
        paymentStatus,
        feeCount: studentFees.length,
        fees: studentFees.map((fee) => ({
          id: fee._id,
          amount: fee.amount,
          term: fee.term,
          status: fee.status,
          receiptNumber: fee.receiptNumber || 'N/A',
          paidAt: fee.paidAt || null,
          createdAt: fee.createdAt,
        })),
      };
    });

    res.status(200).json({
      success: true,
      count: paymentSummary.length,
      data: paymentSummary,
    });
  } catch (error) {
    console.error('❌ Error fetching payment summary:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

const generateReceiptNumber = () => {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RCPT-${ts}-${rnd}`;
};

/**
 * @desc    Record a student payment against their pending fees
 *          (Student or Parent - tracks who paid)
 * @route   POST /api/payments/pay
 * @access  Private (Student or Parent only)
 */
export const payMyFees = async (req, res) => {
  try {
    const { amount, method = 'UPI', transactionId } = req.body || {};

    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid amount',
      });
    }

    let student;
    if (req.user.role === 'parent') {
      const parent = await Parent.findOne({ userId: req.user._id });
      if (!parent) {
        return res.status(404).json({
          success: false,
          message: 'Parent profile not found',
        });
      }
      student = await Student.findById(parent.studentId);
    } else {
      student = await Student.findOne({ userId: req.user._id });
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const pendingFees = await Fee.find({ studentId: student._id, status: 'Pending' }).sort({ createdAt: 1 });
    if (pendingFees.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No pending fees to pay',
        data: [],
      });
    }

    const totalDue = pendingFees.reduce((sum, fee) => sum + (fee.amount || 0), 0);
    if (amount !== totalDue) {
      return res.status(400).json({
        success: false,
        message: `Payment amount mismatch. Expected ₹${totalDue}, received ₹${amount}.`,
      });
    }

    const paidAt = new Date();
    const transactionReceipt = generateReceiptNumber();
    const paidBy = req.user.role === 'parent' ? 'parent' : 'student';
    const paidByUserId = req.user._id;

    // Mark all pending fees as paid
    await Promise.all(
      pendingFees.map(async (fee) => {
        fee.status = 'Paid';
        fee.paidAt = paidAt;
        fee.receiptNumber = fee.receiptNumber || transactionReceipt;
        fee.paidBy = paidBy;
        fee.paidByUserId = paidByUserId;
        await fee.save();
      })
    );

    // Create Payment record
    try {
      await Payment.create({
        studentId: student._id,
        payerType: paidBy === 'parent' ? 'parent' : 'student',
        payerUserId: paidByUserId,
        amount,
        method,
        status: 'Completed',
        transactionId: transactionId || transactionReceipt,
      });
    } catch (payErr) {
      console.error('❌ Failed to create Payment record:', payErr);
      // Not critical - fees are already marked paid, but log for investigation
    }

    const updatedFees = await Fee.find({ studentId: student._id }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: 'Payment recorded successfully',
      data: updatedFees,
      receiptNumber: transactionReceipt,
    });
  } catch (error) {
    console.error('❌ Error recording payment:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};
