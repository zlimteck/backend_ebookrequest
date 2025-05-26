import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { markNotificationAsSeen, getUnseenNotifications } from '../controllers/notificationController.js';

const router = express.Router();

// Marquer une notification comme vue
router.post('/:requestId/seen', requireAuth, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { type = 'completed' } = req.body;
    
    const updatedRequest = await markNotificationAsSeen(requestId, type);
    
    if (!updatedRequest) {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }
    
    res.json({ success: true, request: updatedRequest });
  } catch (error) {
    console.error('Erreur lors du marquage de la notification comme vue:', error);
    res.status(500).json({ error: 'Erreur lors du marquage de la notification comme vue' });
  }
});

// Récupérer les notifications non vues pour l'utilisateur connecté
router.get('/unseen', requireAuth, async (req, res) => {
  try {
    const notifications = await getUnseenNotifications(req.user.id);
    res.json({ success: true, notifications });
  } catch (error) {
    console.error('Erreur lors de la récupération des notifications non vues:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des notifications' });
  }
});

export default router;