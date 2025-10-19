import express from 'express';
import { checkBookAvailability as checkRSS } from '../services/rssService.js';
import { checkBookAvailability as checkXthor } from '../services/xthorService.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/check', requireAuth, async (req, res) => {
  try {
    const { title, author } = req.body;

    if (!title || !author) {
      return res.status(400).json({
        success: false,
        message: 'Le titre et l\'auteur sont requis'
      });
    }

    let result;
    try {
      result = await checkXthor(title, author);
    } catch (xthorError) {
      console.warn('Erreur API Xthor, fallback sur RSS:', xthorError.message);
      result = await checkRSS(title, author);
    }

    return res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Erreur lors de la vérification de disponibilité:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification de disponibilité',
      available: false,
      confidence: 'unknown'
    });
  }
});

export default router;