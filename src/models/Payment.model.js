import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    payerType: {
      type: String,
      enum: ['student', 'parent', 'guardian'],
      required: true,
    },
    payerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    amount: {
      type: Number,
      required: true,
    },
    method: {
      type: String,
      enum: ['UPI', 'Card', 'Netbanking', 'Cash'],
      required: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Failed'],
      default: 'Pending',
    },
    transactionId: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ studentId: 1 });
paymentSchema.index({ transactionId: 1 });

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
