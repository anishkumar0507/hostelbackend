import mongoose from 'mongoose';
import User from '../models/User.model.js';
import Student from '../models/Student.model.js';
import Parent from '../models/Parent.model.js';
import { generateTempPassword } from '../utils/generateTempPassword.js';
import { sendTempPasswordEmail } from '../utils/emailService.js';

/**
 * @desc    Get student's own profile
 * @route   GET /api/students/profile
 * @access  Private (Student only)
 */
export const getMyProfile = async (req, res) => {
  try {
    // Ensure user is authenticated and is a student
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    if (req.user.role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized. This endpoint is for students only.',
      });
    }

    // Find student by userId - ensure proper ObjectId comparison
    // Convert req.user._id to ObjectId if it's a string
    const userId = mongoose.Types.ObjectId.isValid(req.user._id) 
      ? new mongoose.Types.ObjectId(req.user._id) 
      : req.user._id;
    
    const student = await Student.findOne({ userId: userId })
      .populate('userId', 'name email role');

    if (!student) {
      console.error(`❌ Student profile not found for userId: ${req.user._id}`);
      // Log for debugging - check if user exists but student doesn't
      const userCheck = await User.findById(req.user._id);
      if (userCheck) {
        console.error(`   User exists: ${userCheck.email}, role: ${userCheck.role}`);
      }
      
      return res.status(404).json({
        success: false,
        message: 'Student profile not found. Please contact your warden to set up your profile.',
      });
    }

    // Verify the student belongs to this user
    if (student.userId && student.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this profile',
      });
    }

    res.status(200).json({
      success: true,
      data: student,
    });
  } catch (error) {
    console.error('❌ Error fetching student profile:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Get all students
 * @route   GET /api/students
 * @access  Private (Warden only)
 */
export const getAllStudents = async (req, res) => {
  try {
    const students = await Student.find()
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: students.length,
      data: students,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Get all students with their live locations
 * @route   GET /api/students/locations/all
 * @access  Private (Warden only)
 */
export const getAllStudentsWithLocations = async (req, res) => {
  try {
    const students = await Student.find()
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 });

    // Fetch locations for all students
    const { default: StudentLocation } = await import('../models/StudentLocation.model.js');
    const studentLocations = await StudentLocation.find();
    
    // Create a map of studentId -> location for quick lookup
    const locationMap = new Map(studentLocations.map(loc => [loc.studentId.toString(), loc]));

    // Enrich students with their location data
    const studentsWithLocations = students.map(student => {
      const location = locationMap.get(student._id.toString());
      return {
        ...student.toObject(),
        location: location ? {
          lat: location.lat,
          lng: location.lng,
          accuracy: location.accuracy,
          lastUpdated: location.lastUpdated,
          isSharingEnabled: location.isSharingEnabled,
          permissionGranted: location.permissionGranted,
        } : null,
      };
    });

    res.status(200).json({
      success: true,
      count: studentsWithLocations.length,
      data: studentsWithLocations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Get student by ID
 * @route   GET /api/students/:id
 * @access  Private (Warden only)
 */
export const getStudentById = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('userId', 'name email role');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    res.status(200).json({
      success: true,
      data: student,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Create new student account
 * @route   POST /api/students
 * @access  Private (Warden only)
 */
export const createStudent = async (req, res) => {
  try {
    const {
      name,
      email,
      class: studentClass,
      section,
      rollNumber,
      phone,
      room, // Optional room assignment
      guardianName,
      guardianEmail,
      guardianPhone,
    } = req.body;

    // Validate required fields (password is NOT required - will be generated)
    if (!name || !email || !studentClass || !rollNumber) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, class, and rollNumber',
      });
    }

      // Guardian info updates are handled here but guardian user creation/linking is performed separately
      if (guardianName !== undefined) student.guardianName = guardianName.trim() || undefined;
      if (guardianEmail !== undefined) student.guardianEmail = guardianEmail.toLowerCase().trim() || undefined;
      if (guardianPhone !== undefined) student.guardianPhone = guardianPhone.trim() || undefined;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    // Validate name
    if (name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Name must be at least 2 characters long',
      });
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    // Check if rollNumber already exists
    const existingStudent = await Student.findOne({ rollNumber: rollNumber.trim() });
    if (existingStudent) {
      return res.status(400).json({
        success: false,
        message: 'Student with this roll number already exists',
      });
    }

    // Generate temporary password
    const tempPassword = generateTempPassword();

    // Create user account with temporary password
    let user;
    try {
      user = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        password: tempPassword, // Will be hashed by pre-save hook
        isTempPassword: true, // Mark as temporary
        role: 'student',
      });
    } catch (userError) {
      // Handle case where user creation fails (e.g., duplicate email race condition)
      if (userError.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists',
        });
      }
      throw userError; // Re-throw to be caught by outer catch
    }

    // Create student profile with proper userId reference and location tracking enabled
    const student = await Student.create({
      userId: user._id, // Explicitly link to the created user
      class: studentClass.trim(),
      section: section ? section.trim() : undefined,
      rollNumber: rollNumber.trim(),
      phone: phone ? phone.trim() : undefined,
      room: room ? room.trim() : undefined,
      guardianName: guardianName ? guardianName.trim() : undefined,
      guardianEmail: guardianEmail ? guardianEmail.toLowerCase().trim() : undefined,
      guardianPhone: guardianPhone ? guardianPhone.trim() : undefined,
      locationTrackingEnabled: true, // Enable location sharing by default for all students
    });

    // Verify student was created with correct userId link
    if (!student || !student.userId) {
      // Rollback: delete the user if student creation failed
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({
        success: false,
        message: 'Failed to create student profile. User account has been removed.',
      });
    }

    // Verify the userId link is correct
    if (student.userId.toString() !== user._id.toString()) {
      console.error('❌ Student userId mismatch:', {
        studentUserId: student.userId,
        expectedUserId: user._id,
      });
      // Clean up both records
      await Student.findByIdAndDelete(student._id);
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({
        success: false,
        message: 'Failed to link student profile to user account',
      });
    }

    // Populate student data for response
    const populatedStudent = await Student.findById(student._id)
      .populate('userId', 'name email role');

    // Send temporary password email (completely non-blocking - fire and forget)
    // This runs asynchronously and will NOT affect the API response
    sendTempPasswordEmail(normalizedEmail, name.trim(), tempPassword)
      .then(() => {
        console.log(`✅ Temporary password email sent to ${normalizedEmail}`);
      })
      .catch((emailError) => {
        // Log email error but don't fail student creation
        console.error('❌ Failed to send email (student account still created):', emailError.message || emailError);
        console.log(`📝 Temporary password for ${name.trim()} (${normalizedEmail}): ${tempPassword}`);
      });

    // Return success response immediately - email sending happens in background
    // If guardian info present, create guardian user and Parent link
    if (guardianEmail) {
      try {
        const normalizedGEmail = guardianEmail.toLowerCase().trim();
        let guardianUser = await User.findOne({ email: normalizedGEmail });
        // If user exists but not a parent, skip creation but still link
        if (!guardianUser) {
          const guardianTempPassword = generateTempPassword();
          guardianUser = await User.create({
            name: guardianName?.trim() || 'Guardian',
            email: normalizedGEmail,
            password: guardianTempPassword,
            isTempPassword: true,
            role: 'parent',
          });

          // send temp password email to guardian
          sendTempPasswordEmail(normalizedGEmail, guardianName || 'Guardian', guardianTempPassword)
            .then(() => console.log(`✅ Guardian temp password email sent to ${normalizedGEmail}`))
            .catch((err) => console.error('❌ Failed to send guardian email:', err.message || err));
        }

        // Ensure Parent document exists linking guardianUser to student
        const existingParent = await Parent.findOne({ userId: guardianUser._id });
        if (!existingParent) {
          await Parent.create({ userId: guardianUser._id, studentId: student._id, relationship: 'Guardian' });
        } else {
          // Update student link if different
          if (existingParent.studentId.toString() !== student._id.toString()) {
            existingParent.studentId = student._id;
            await existingParent.save();
          }
        }
      } catch (gErr) {
        console.error('❌ Error creating/linking guardian:', gErr);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Student account created successfully. Temporary password has been sent to student email.',
      data: populatedStudent,
      // Note: Password is NEVER returned in response for security
    });
  } catch (error) {
    // Log the actual error for debugging
    console.error('❌ Error creating student:', error);

    // Handle duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `${field} already exists`,
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', '),
      });
    }

    // Handle mongoose cast errors
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid data format',
      });
    }

    // Generic server error with more context in development
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' 
        ? 'Server error. Please try again later.' 
        : error.message || 'Server error',
    });
  }
};

/**
 * @desc    Update student details
 * @route   PUT /api/students/:id
 * @access  Private (Warden only)
 */
export const updateStudent = async (req, res) => {
  try {
    const {
      name,
      email,
      class: studentClass,
      section,
      rollNumber,
      phone,
      room,
      guardianName,
      guardianEmail,
      guardianPhone,
    } = req.body;

    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Update student profile
    if (studentClass !== undefined && studentClass.trim()) {
      student.class = studentClass.trim();
    }
    if (section !== undefined) {
      student.section = section.trim() || undefined;
    }
    if (rollNumber !== undefined && rollNumber.trim()) {
      // Check if rollNumber already exists
      const existingStudent = await Student.findOne({
        rollNumber: rollNumber.trim(),
        _id: { $ne: student._id },
      });
      if (existingStudent) {
        return res.status(400).json({
          success: false,
          message: 'Roll number already in use',
        });
      }
      student.rollNumber = rollNumber.trim();
    }
    if (phone !== undefined) {
      student.phone = phone.trim() || undefined;
    }
    if (room !== undefined) {
      student.room = room.trim() || undefined;
    }

    // Update guardian contact fields on student
    if (guardianName !== undefined) student.guardianName = guardianName.trim() || undefined;
    if (guardianEmail !== undefined) student.guardianEmail = guardianEmail.toLowerCase().trim() || undefined;
    if (guardianPhone !== undefined) student.guardianPhone = guardianPhone.trim() || undefined;

    await student.save();

    // Update user if name or email provided
    if (name || email) {
      const user = await User.findById(student.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User account not found for this student',
        });
      }
      if (name) user.name = name.trim();
      if (email) {
        const normalizedEmail = email.toLowerCase().trim();
        // Check if email already exists
        const existingUser = await User.findOne({
          email: normalizedEmail,
          _id: { $ne: user._id },
        });
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'Email already in use',
          });
        }
        user.email = normalizedEmail;
      }
      await user.save();
    }

    // If guardianEmail provided, ensure guardian user exists and Parent link is created/updated
    if (guardianEmail) {
      try {
        const normalizedGEmail = guardianEmail.toLowerCase().trim();
        let guardianUser = await User.findOne({ email: normalizedGEmail });
        if (!guardianUser) {
          const guardianTempPassword = generateTempPassword();
          guardianUser = await User.create({
            name: guardianName?.trim() || 'Guardian',
            email: normalizedGEmail,
            password: guardianTempPassword,
            isTempPassword: true,
            role: 'parent',
          });
          sendTempPasswordEmail(normalizedGEmail, guardianName || 'Guardian', guardianTempPassword)
            .then(() => console.log(`✅ Guardian temp password email sent to ${normalizedGEmail}`))
            .catch((err) => console.error('❌ Failed to send guardian email:', err.message || err));
        }

        let parentLink = await Parent.findOne({ userId: guardianUser._id });
        if (!parentLink) {
          await Parent.create({ userId: guardianUser._id, studentId: student._id, relationship: 'Guardian' });
        } else if (parentLink.studentId.toString() !== student._id.toString()) {
          parentLink.studentId = student._id;
          await parentLink.save();
        }
      } catch (err) {
        console.error('❌ Error creating/updating guardian link:', err);
      }
    }

    const updatedStudent = await Student.findById(student._id)
      .populate('userId', 'name email role');

    res.status(200).json({
      success: true,
      message: 'Student updated successfully',
      data: updatedStudent,
    });
  } catch (error) {
    console.error('❌ Error updating student:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

/**
 * @desc    Delete student account
 * @route   DELETE /api/students/:id
 * @access  Private (Warden only)
 */
export const deleteStudent = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Delete the user account associated with this student
    if (student.userId) {
      await User.findByIdAndDelete(student.userId);
    }

    // Delete the student profile
    await Student.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Student account deleted successfully',
    });
  } catch (error) {
    console.error('❌ Error deleting student:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};
