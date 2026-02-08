import Leave from '../models/Leave.model.js';
import Student from '../models/Student.model.js';
import Parent from '../models/Parent.model.js';
import XLSX from 'xlsx';

/**
 * @desc    Create a new leave request
 * @route   POST /api/leaves
 * @access  Private (Student only)
 */
export const createLeaveRequest = async (req, res) => {
  try {
    const { reason, type, outDate, inDate, outTime, inTime } = req.body;

    // Validate required fields
    if (!reason || !type || !outDate || !inDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide reason, type, out date, and in date',
      });
    }

    // Validate dates
    const outDateObj = new Date(outDate);
    const inDateObj = new Date(inDate);

    if (outDateObj >= inDateObj) {
      return res.status(400).json({
        success: false,
        message: 'Out date must be before in date',
      });
    }

    // Get student details
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    // Create leave request - 3-step: Student -> Parent -> Warden
    const leave = await Leave.create({
      studentId: student._id,
      reason: reason.trim(),
      type,
      outDate: outDateObj,
      inDate: inDateObj,
      outTime,
      inTime,
      status: 'PendingParent',
      parentApprovalStatus: 'Pending',
      statusHistory: [{
        status: 'PendingParent',
        role: 'student',
        timestamp: new Date(),
      }],
    });

    // Populate student details
    await leave.populate('studentId', 'userId room');
    await leave.populate('studentId.userId', 'name');

    res.status(201).json({
      success: true,
      message: 'Leave request submitted successfully',
      leave: {
        id: leave._id,
        reason: leave.reason,
        type: leave.type,
        outDate: leave.outDate,
        inDate: leave.inDate,
        outTime: leave.outTime,
        inTime: leave.inTime,
        status: leave.status,
        createdAt: leave.createdAt,
        student: {
          name: leave.studentId.userId.name,
          room: leave.studentId.room,
        },
      },
    });
  } catch (error) {
    console.error('Create leave error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating leave request',
    });
  }
};

/**
 * @desc    Get all leave requests (for warden)
 * @route   GET /api/leaves
 * @access  Private (Warden only)
 */
export const getAllLeaveRequests = async (req, res) => {
  try {
    const { status } = req.query;

    const filter = {};
    if (status) {
      filter.status = status;
    }
    // Warden sees: PendingParent (info only), ApprovedByParent (to approve), Approved, Rejected, RejectedByParent, Cancelled
    // By default show all; frontend can filter for "ApprovedByParent" for pending warden approval

    const leaves = await Leave.find(filter)
      .populate('studentId', 'userId room')
      .populate('studentId.userId', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });

    const formattedLeaves = leaves.map(leave => ({
      id: leave._id,
      reason: leave.reason,
      type: leave.type,
      outDate: leave.outDate,
      inDate: leave.inDate,
      outTime: leave.outTime,
      inTime: leave.inTime,
      status: leave.status,
      createdAt: leave.createdAt,
      approvedAt: leave.approvedAt,
      rejectionReason: leave.rejectionReason,
      student: {
        name: leave.studentId.userId.name,
        room: leave.studentId.room,
      },
      approvedBy: leave.approvedBy ? leave.approvedBy.name : null,
    }));

    res.status(200).json({
      success: true,
      leaves: formattedLeaves,
    });
  } catch (error) {
    console.error('Get leaves error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching leave requests',
    });
  }
};

/**
 * @desc    Get student's own leave requests
 * @route   GET /api/leaves/my
 * @access  Private (Student only)
 */
export const getMyLeaveRequests = async (req, res) => {
  try {
    // Get student details
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const leaves = await Leave.find({ studentId: student._id })
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });

    const formattedLeaves = leaves.map(leave => ({
      id: leave._id,
      reason: leave.reason,
      type: leave.type,
      outDate: leave.outDate,
      inDate: leave.inDate,
      outTime: leave.outTime,
      inTime: leave.inTime,
      status: leave.status,
      createdAt: leave.createdAt,
      approvedAt: leave.approvedAt,
      rejectionReason: leave.rejectionReason,
      approvedBy: leave.approvedBy ? leave.approvedBy.name : null,
    }));

    res.status(200).json({
      success: true,
      leaves: formattedLeaves,
    });
  } catch (error) {
    console.error('Get my leaves error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching leave requests',
    });
  }
};

/**
 * @desc    Parent approves or rejects leave request
 * @route   PUT /api/leaves/:id/parent-approval
 * @access  Private (Parent only)
 */
export const parentApproveOrReject = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be Approved or Rejected',
      });
    }

    const parent = await Parent.findOne({ userId: req.user._id });
    if (!parent) {
      return res.status(403).json({
        success: false,
        message: 'Parent profile not found',
      });
    }

    const newStatus = status === 'Approved' ? 'ApprovedByParent' : 'RejectedByParent';
    const decisionTime = new Date();
    const updateData = {
      status: newStatus,
      parentApprovalStatus: status,
      parentApprovedBy: req.user._id,
      parentApprovedAt: decisionTime,
      parentRejectionReason: status === 'Rejected' ? rejectionReason : undefined,
      statusHistory: [{
        status: newStatus,
        updatedBy: req.user._id,
        role: 'parent',
        reason: status === 'Rejected' ? rejectionReason : undefined,
        timestamp: decisionTime,
      }],
    };

    const updated = await Leave.findOneAndUpdate(
      { _id: id, studentId: parent.studentId, status: 'PendingParent' },
      {
        $set: {
          status: updateData.status,
          parentApprovalStatus: updateData.parentApprovalStatus,
          parentApprovedBy: updateData.parentApprovedBy,
          parentApprovedAt: updateData.parentApprovedAt,
          parentRejectionReason: updateData.parentRejectionReason,
        },
        $push: { statusHistory: updateData.statusHistory[0] },
      },
      { new: true }
    )
      .populate('studentId', 'userId room')
      .populate('studentId.userId', 'name')
      .populate('parentApprovedBy', 'name');

    if (!updated) {
      const existing = await Leave.findById(id).populate('studentId', 'userId room');
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Leave request not found',
        });
      }
      if (existing.studentId?._id?.toString() !== parent.studentId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to approve this leave request',
        });
      }
      return res.status(409).json({
        success: false,
        message: 'This outing request was already processed by parent',
      });
    }

    return res.status(200).json({
      success: true,
      message: `Leave request ${status.toLowerCase()} by parent`,
      leave: {
        id: updated._id,
        reason: updated.reason,
        type: updated.type,
        outDate: updated.outDate,
        inDate: updated.inDate,
        status: updated.status,
        parentApprovalStatus: updated.parentApprovalStatus,
        statusHistory: updated.statusHistory,
      },
    });
  } catch (error) {
    console.error('Parent approve leave error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating leave request',
    });
  }
};

/**
 * @desc    Update leave request status (for warden) - only for parent-approved requests
 * @route   PUT /api/leaves/:id/status
 * @access  Private (Warden only)
 */
export const updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be Approved or Rejected',
      });
    }

    const decisionTime = new Date();
    const updated = await Leave.findOneAndUpdate(
      { _id: id, status: 'ApprovedByParent' },
      {
        $set: {
          status,
          approvedBy: req.user._id,
          approvedAt: status === 'Approved' ? decisionTime : undefined,
          rejectionReason: status === 'Rejected' ? rejectionReason : undefined,
        },
        $push: {
          statusHistory: {
            status,
            updatedBy: req.user._id,
            role: 'warden',
            reason: status === 'Rejected' ? rejectionReason : undefined,
            timestamp: decisionTime,
          },
        },
      },
      { new: true }
    )
      .populate('studentId', 'userId room')
      .populate('studentId.userId', 'name')
      .populate('approvedBy', 'name');

    if (!updated) {
      const existing = await Leave.findById(id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Leave request not found',
        });
      }
      return res.status(409).json({
        success: false,
        message: 'This outing request was already processed by warden',
      });
    }

    res.status(200).json({
      success: true,
      message: `Leave request ${status.toLowerCase()} successfully`,
      leave: {
        id: updated._id,
        reason: updated.reason,
        type: updated.type,
        outDate: updated.outDate,
        inDate: updated.inDate,
        outTime: updated.outTime,
        inTime: updated.inTime,
        status: updated.status,
        createdAt: updated.createdAt,
        approvedAt: updated.approvedAt,
        rejectionReason: updated.rejectionReason,
        student: {
          name: updated.studentId.userId.name,
          room: updated.studentId.room,
        },
        approvedBy: updated.approvedBy?.name,
      },
    });
  } catch (error) {
    console.error('Update leave status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating leave request',
    });
  }
};

const formatExportDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
};

const getWardenDecisionTimestamp = (leave) => {
  if (!leave?.statusHistory || leave.statusHistory.length === 0) {
    return leave.approvedAt || null;
  }
  const entry = [...leave.statusHistory]
    .reverse()
    .find((item) => item?.role === 'warden' && ['Approved', 'Rejected'].includes(item.status));
  return entry?.timestamp || leave.approvedAt || null;
};

/**
 * @desc    Export outing requests (approved/rejected) as Excel
 * @route   GET /api/warden/outing/export
 * @access  Private (Warden only)
 */
export const exportOutingReport = async (req, res) => {
  try {
    const leaves = await Leave.find({
      status: { $in: ['Approved', 'Rejected', 'RejectedByParent'] },
    })
      .populate({
        path: 'studentId',
        select: 'userId room rollNumber',
        populate: { path: 'userId', select: 'name' },
      })
      .populate('parentApprovedBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });

    const rows = leaves.map((leave) => {
      const student = leave.studentId || {};
      const studentUser = student.userId || {};
      const wardenDecision = leave.status === 'Approved'
        ? 'Approved'
        : leave.status === 'Rejected'
          ? 'Rejected'
          : 'N/A';
      const wardenDecisionAt = wardenDecision === 'N/A' ? null : getWardenDecisionTimestamp(leave);

      return {
        'Student Name': studentUser.name || 'N/A',
        'Roll Number': student.rollNumber || 'N/A',
        'Room': student.room || 'N/A',
        'Outing Reason': leave.reason || '',
        'From Date': formatExportDate(leave.outDate),
        'To Date': formatExportDate(leave.inDate),
        'Parent Decision': leave.parentApprovalStatus || 'Pending',
        'Parent Decision Time': formatExportDate(leave.parentApprovedAt),
        'Warden Decision': wardenDecision,
        'Warden Decision Time': formatExportDate(wardenDecisionAt),
      };
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Outing Requests');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const fileName = `outing-report-${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('Export outing report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while exporting outing report',
    });
  }
};

/**
 * @desc    Cancel a student's own pending leave request
 * @route   PUT /api/leaves/:id/cancel
 * @access  Private (Student only)
 */
export const cancelMyLeaveRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found',
      });
    }

    const leave = await Leave.findById(id)
      .populate('studentId', 'userId room')
      .populate('studentId.userId', 'name');

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found',
      });
    }

    if (leave.studentId._id.toString() !== student._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this leave request',
      });
    }

    if (!['Pending', 'PendingParent'].includes(leave.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only pending requests (before parent/warden approval) can be cancelled',
      });
    }

    leave.status = 'Cancelled';
    await leave.save();

    return res.status(200).json({
      success: true,
      message: 'Leave request cancelled successfully',
      leave: {
        id: leave._id,
        reason: leave.reason,
        type: leave.type,
        outDate: leave.outDate,
        inDate: leave.inDate,
        outTime: leave.outTime,
        inTime: leave.inTime,
        status: leave.status,
        createdAt: leave.createdAt,
        approvedAt: leave.approvedAt,
        rejectionReason: leave.rejectionReason,
      },
    });
  } catch (error) {
    console.error('Cancel leave error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while cancelling leave request',
    });
  }
};