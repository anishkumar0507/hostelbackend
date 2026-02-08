import express from 'express';
import cors from 'cors';

// Import routes
// Note: dotenv is loaded in server.js before app is imported
import authRoutes from './routes/auth.routes.js';
import studentRoutes from './routes/student.routes.js';
import entryExitRoutes from './routes/entryExit.routes.js';
import feeRoutes from './routes/fee.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import complaintRoutes from './routes/complaint.routes.js';
import leaveRoutes from './routes/leave.routes.js';
import parentRoutes from './routes/parent.routes.js';
import locationRoutes from './routes/location.routes.js';
import chatRoutes from './routes/chat.routes.js';
import wardenRoutes from './routes/warden.routes.js';

// Import error middleware
import { errorHandler, notFound } from './middleware/error.middleware.js';

// Initialize Express app
const app = express();

// Middleware
// CORS configuration - allow frontend URL from environment or allow-all for testing
const allowedOrigins = [
  'https://hostelmanagement-eta.vercel.app',
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    if (process.env.CORS_ALLOW_ALL === 'true') {
      return callback(null, true);
    }

    const originBase = origin.replace(/^https?:\/\//, '').split('/')[0];
    const allowed = allowedOrigins.some((url) => {
      const base = url.replace(/^https?:\/\//, '').split('/')[0];
      return base === originBase || (base.includes('vercel.app') && originBase.includes('vercel.app'));
    });

    if (allowed) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'HostelEase API is running',
    timestamp: new Date().toISOString(),
  });
});

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/entry-exit', entryExitRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/warden', wardenRoutes);

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

export default app;
