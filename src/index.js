import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import bookRequestRoutes from './routes/bookRequest.js';
import authRoutes from './routes/auth.js';
import googleBooksRoutes from './routes/googleBooks.js';
import pushoverRoutes from './routes/pushover.js';
import notificationRoutes from './routes/notifications.js';
import userRoutes from './routes/user.js';
import adminUserRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import activityRoutes from './routes/activity.js';
import availabilityRoutes from './routes/availability.js';
import trendingRoutes from './routes/trending.js';
import bestsellerRoutes from './routes/bestsellers.js';
import recommendationRoutes from './routes/recommendations.js';
import { initializeTrendingBooksCache } from './services/trendingBooksService.js';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const app = express();
const PORT = process.env.PORT || 5001;

// Configuration CORS dynamique basée sur les variables d'environnement
const corsOptions = {
  origin: function (origin, callback) {
    // En développement, autoriser toutes les origines
    if (process.env.NODE_ENV === 'development' || !origin) {
      return callback(null, true);
    }

    const allowedOrigins = [
      process.env.FRONTEND_URL,
      process.env.REACT_APP_API_URL,
    ].filter(Boolean);

    // Vérifier si l'origine est autorisée
    if (allowedOrigins.some(allowedOrigin => 
      origin === allowedOrigin || 
      origin.startsWith(allowedOrigin.replace(/^https?:\/\//, 'http://')) ||
      origin.startsWith(allowedOrigin.replace(/^https?:\/\//, 'https://'))
    )) {
      callback(null, true);
    } else {
      console.warn('Tentative d\'accès non autorisée depuis :', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Disposition']
};

app.use(cors(corsOptions));
// Augmentation des limites pour gérer les fichiers jusqu'à 500MB
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/requests', bookRequestRoutes);
app.use('/api/books', googleBooksRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pushover', pushoverRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/trending', trendingRoutes);
app.use('/api/admin/bestsellers', bestsellerRoutes);
app.use('/api/recommendations', recommendationRoutes);

// Route test
app.get('/', (req, res) => {
  res.send('Backend ebook en ligne.');
});

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  app.listen(PORT, () => {
    console.log(`Serveur backend lancé sur le port ${PORT}`);

    // Initialiser le cache des livres tendance au démarrage (sans bloquer le serveur)
    initializeTrendingBooksCache();
  });
})
.catch((error) => console.error('Erreur de connexion MongoDB:', error));