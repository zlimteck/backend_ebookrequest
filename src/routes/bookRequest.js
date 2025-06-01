import express from 'express';
import { 
  createBookRequest,
  getUserRequests,
  getAllRequests,
  updateRequestStatus,
  addDownloadLink,
  deleteRequest,
  markAsDownloaded,
  downloadEbook
} from '../controllers/bookRequestController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import upload from '../middleware/upload.js';

const router = express.Router();

// Créer une nouvelle requête de livre
router.post('/', requireAuth, createBookRequest);

// Récupérer les demandes de l'utilisateur connecté
router.get('/my-requests', requireAuth, getUserRequests);

// Récupérer toutes les demandes (admin uniquement)
router.get('/all', requireAuth, requireAdmin, getAllRequests);

// Mettre à jour le statut d'une demande (admin uniquement)
router.patch('/:id/status', requireAuth, requireAdmin, updateRequestStatus);

// Ajouter un lien de téléchargement ou uploader un fichier (admin uniquement)
router.patch('/:id/download-link', 
  requireAuth, 
  requireAdmin, 
  upload.single('file'),
  addDownloadLink
);

// Télécharger un fichier ebook
router.get('/download/:id', requireAuth, downloadEbook);

// Marquer comme téléchargé
router.put('/:id/mark-downloaded', requireAuth, markAsDownloaded);
router.delete('/:id', requireAuth, requireAdmin, deleteRequest);

export default router;