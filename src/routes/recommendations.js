import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import BookRequest from '../models/BookRequest.js';
import { generateRecommendations, testOllamaConnection } from '../services/recommendationService.js';

const router = express.Router();

// Obtient des recommandations de livres basées sur l'historique de l'utilisateur
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 5;

    // Récupérer l'historique des demandes de l'utilisateur
    const bookRequests = await BookRequest.find({ user: userId })
      .sort({ createdAt: -1 })
      .select('title author description pageCount')
      .lean();

    console.log(`Génération de ${limit} recommandations pour l'utilisateur ${req.user.username} basées sur ${bookRequests.length} demandes`);

    // Générer les recommandations via Ollama
    const result = await generateRecommendations(bookRequests, limit);

    res.json({
      success: true,
      ...result,
      totalRequests: bookRequests.length
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des recommandations:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la génération des recommandations',
      error: error.message,
      recommendations: []
    });
  }
});

// Vérifie l'état de la connexion avec Ollama
router.get('/status', requireAuth, async (req, res) => {
  try {
    const status = await testOllamaConnection();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Erreur lors du test de connexion Ollama:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du test de connexion',
      error: error.message
    });
  }
});

export default router;