import mongoose from 'mongoose';

/**
 * Student location - permission-based.
 * Student can enable/disable sharing. When enabled, last known location is stored.
 * Warden and Parent can view only if sharing is enabled.
 */
const studentLocationSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      unique: true,
    },
    isSharingEnabled: {
      type: Boolean,
      default: false,
    },
    permissionGranted: {
      type: Boolean,
      default: true,
    },
    lat: {
      type: Number,
    },
    lng: {
      type: Number,
    },
    accuracy: { type: Number },
    lastUpdated: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const StudentLocation = mongoose.model('StudentLocation', studentLocationSchema);

export default StudentLocation;
