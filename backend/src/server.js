require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/authRoutes');
const videoRoutes = require('./routes/videoRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();

// Connect to MongoDB Atlas
connectDB();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Health check
app.get('/', (req, res) => {
  res.json({
    message: 'DACNTT Video Streaming API is running...',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/users', userRoutes);

// Global error handler (must be AFTER routes)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
});
