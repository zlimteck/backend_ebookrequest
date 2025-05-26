import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import pushoverService from '../services/pushoverService.js';

const router = express.Router();

// Récupérer la configuration Pushover
router.get('/config', requireAuth, async (req, res) => {
  try {
    const config = await pushoverService.getConfig();
    res.json(config || { 
      enabled: false, 
      userKey: '', 
      apiToken: '',
      notifyOnNewRequest: true
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la configuration Pushover:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de la configuration Pushover' });
  }
});

// Mettre à jour la configuration Pushover
router.put('/config', requireAuth, async (req, res) => {
  try {
    const { enabled, userKey, apiToken, notifyOnNewRequest } = req.body;
    
    if (typeof enabled !== 'boolean' || 
        (enabled && (!userKey || !apiToken))) {
      return res.status(400).json({ 
        message: 'Une clé utilisateur et un jeton API sont requis pour activer les notifications Pushover' 
      });
    }

    const config = await pushoverService.updateConfig({
      enabled,
      userKey: userKey || '',
      apiToken: apiToken || '',
      notifyOnNewRequest: notifyOnNewRequest !== false, // true par défaut
      configuredBy: req.user.id
    });

    res.json(config);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la configuration Pushover:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour de la configuration Pushover' });
  }
});

// Tester la configuration Pushover
router.post('/test', requireAuth, async (req, res) => {
  try {
    const config = await pushoverService.getConfig();
    
    if (!config || !config.enabled || !config.userKey || !config.apiToken) {
      return res.status(400).json({ 
        message: 'Veuillez configurer Pushover avant de tester' 
      });
    }

    const testMessage = `🔔 Test de notification Pushover
    
✅ Votre configuration Pushover est correctement paramétrée !

Vous recevrez désormais des notifications pour :
• Nouvelles demandes d'ebook
• Demandes traitées
• Activités importantes`;

    const result = await pushoverService.sendNotification(
      '🔔 Test Pushover Réussi',
      testMessage,
      {
        priority: 1,
        sound: 'magic',
        url: process.env.FRONTEND_URL,
        url_title: 'Aller sur EbookRequest',
        html: 1
      }
    );

    if (result.success) {
      res.json({ message: 'Notification de test envoyée avec succès !' });
    } else {
      res.status(500).json({ 
        message: 'Échec de l\'envoi de la notification de test',
        error: result.error 
      });
    }
  } catch (error) {
    console.error('Erreur lors de l\'envoi de la notification de test:', error);
    res.status(500).json({ 
      message: 'Erreur lors de l\'envoi de la notification de test',
      error: error.message 
    });
  }
});

export default router;