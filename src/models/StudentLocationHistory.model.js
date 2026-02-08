import mongoose from 'mongoose';

const StudentLocationHistorySchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  accuracy: { type: Number },
  timestamp: { type: Date, default: Date.now, index: true },
});

export default mongoose.model('StudentLocationHistory', StudentLocationHistorySchema);
