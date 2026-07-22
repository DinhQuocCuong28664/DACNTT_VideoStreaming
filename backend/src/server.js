require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const videoRoutes = require('./routes/videoRoutes');

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Routes
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'DACNTT Video Streaming API is running...',
    version: '1.0.0',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);

// Error Handler Middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
});
