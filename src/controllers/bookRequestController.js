import BookRequest from '../models/BookRequest.js';
import User from '../models/User.js';
import { sendBookCompletedEmail, sendRequestCanceledEmail } from '../services/emailService.js';
import pushoverService from '../services/pushoverService.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Création d'une nouvelle demande de livre
export const createBookRequest = async (req, res) => {
  try {
    const { author, title, link, thumbnail, description, pageCount } = req.body;
    
    // Validation des champs obligatoires
    if (!author || !title) {
      return res.status(400).json({ error: 'Les champs auteur et titre sont obligatoires.' });
    }
    
    // Vérification du lien côté backend
    try {
      const url = new URL(link);
      if (!/^https?:/.test(url.protocol)) {
        return res.status(400).json({ error: 'Le lien doit commencer par http:// ou https://.' });
      }
    } catch {
      return res.status(400).json({ error: "Le lien fourni n'est pas une URL valide." });
    }
    
    // Récupérer l'utilisateur complet depuis la base de données
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }

    const newRequest = new BookRequest({
      user: user._id,
      username: user.username,
      author,
      title,
      link: link || '',
      thumbnail: thumbnail || '',
      description: description || '',
      pageCount: pageCount || 0,
      status: 'pending'
    });
    
    await newRequest.save();
    
    // Envoyer une notification Pushover pour la nouvelle demande
    try {
      await pushoverService.sendNotification(
        '📚 Nouvelle demande d\'Ebook',
        `👤 ${user.username} a demandé un nouveau livre :
        
📖 Titre: ${title}
✍️ Auteur: ${author}${link ? '\n🔗 Lien: ' + link : ''}`,
        {
          priority: 1,
          sound: 'magic',
          url: link || `${process.env.FRONTEND_URL}/admin`,
          url_title: 'Voir la demande',
          html: 1
        }
      );
    } catch (pushoverError) {
      console.error('Erreur lors de l\'envoi de la notification Pushover:', pushoverError);
    }
    
    res.status(201).json(newRequest);
  } catch (error) {
    console.error('Erreur lors de la création de la demande:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la demande' });
  }
};

// Récupération des demandes de l'utilisateur connecté
export const getUserRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const query = { user: req.user.id };
    
    if (status) {
      query.status = status;
    }
    
    const requests = await BookRequest.find(query).sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error('Erreur lors de la récupération des demandes:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des demandes' });
  }
};

// Récupération de toutes les demandes (admin uniquement)
export const getAllRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    
    // Ne pas filtrer par statut si 'all' est sélectionné
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const requests = await BookRequest.find(query).sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error('Erreur lors de la récupération des demandes:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des demandes' });
  }
};

// Mise à jour du statut d'une demande
export const updateRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!['pending', 'completed', 'canceled'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }

    const updateFields = { status };
    if (status === 'canceled' && reason) {
      updateFields.cancelReason = reason;
      
      // Envoyer un email de notification d'annulation
      try {
        const requestWithUser = await BookRequest.findById(id).populate('user', 'email username notificationPreferences');
        if (requestWithUser?.user?.email) {
          await sendRequestCanceledEmail(requestWithUser.user, {
            ...requestWithUser.toObject(),
            cancelReason: reason
          });
        }
      } catch (emailError) {
        console.error('Erreur lors de l\'envoi de l\'email d\'annulation:', emailError);
        // Ne pas échouer la requête à cause d'une erreur d'email
      }
    } else if (status !== 'canceled') {
      updateFields.cancelReason = undefined;
    }
    if (status === 'completed') {
      updateFields.completedAt = new Date();
    }

    const request = await BookRequest.findByIdAndUpdate(
      id,
      updateFields,
      { new: true }
    );

    if (!request) {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }
    
    res.json(request);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du statut:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du statut' });
  }
};

export const downloadEbook = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await BookRequest.findById(id);
    
    if (!request) {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }
    
    // Vérifier si c'est un fichier local ou un lien externe
    if (request.filePath) {
      // Téléchargement d'un fichier local
      const filePath = path.join(__dirname, '../../uploads', request.filePath);
      
      // Vérifier que le fichier existe
      if (!fs.existsSync(filePath)) {
        console.error(`Fichier introuvable: ${filePath}`);
        return res.status(404).json({ 
          error: 'Fichier introuvable sur le serveur',
          details: `Le fichier ${request.filePath} n'existe pas dans le répertoire de téléchargement`
        });
      }
      
      // Mettre à jour la date de téléchargement
      request.downloadedAt = new Date();
      await request.save();
      
      // Définir les en-têtes pour le téléchargement
      const fileName = path.basename(filePath);
      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error('Erreur lors de l\'envoi du fichier:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Erreur lors de l\'envoi du fichier' });
          }
        }
      });
      
    } else if (request.downloadLink) {
      // Redirection vers un lien externe
      request.downloadedAt = new Date();
      await request.save();
      return res.redirect(request.downloadLink);
      
    } else {
      return res.status(404).json({ 
        error: 'Aucun contenu de téléchargement disponible pour cette demande' 
      });
    }
    
  } catch (error) {
    console.error('Erreur lors du téléchargement du fichier:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Erreur lors du téléchargement du fichier',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
};

// Ajout d'un lien de téléchargement ou d'un fichier à une demande
export const addDownloadLink = async (req, res) => {
  try {
    const { id } = req.params;
    const { downloadLink } = req.body;
    const file = req.file; // Fichier téléversé via multer
    
    const updateData = {
      status: 'completed',
      completedAt: new Date()
    };
    
    // Si un fichier a été téléversé
    if (file) {
      updateData.filePath = `books/${file.filename}`;
      updateData.downloadLink = ''; // Effacer l'ancien lien s'il existe
      console.log(`Fichier téléversé: ${file.filename}`);
    } 
    // Sinon, vérifier le lien
    else if (downloadLink) {
      try {
        const url = new URL(downloadLink);
        if (!/^https?:/.test(url.protocol)) {
          return res.status(400).json({ error: 'Le lien doit commencer par http:// ou https://' });
        }
        updateData.downloadLink = downloadLink;
        updateData.filePath = ''; // Effacer l'ancien fichier s'il existe
        console.log(`Lien de téléchargement ajouté: ${downloadLink}`);
      } catch (error) {
        return res.status(400).json({ error: "Le lien fourni n'est pas une URL valide" });
      }
    } else {
      return res.status(400).json({ error: "Un lien de téléchargement ou un fichier est requis" });
    }
    
    const request = await BookRequest.findByIdAndUpdate(id, updateData, { new: true });
    
    if (!request) {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }
    
    // Récupérer l'utilisateur pour l'email
    const user = await User.findById(request.user);
    if (user) {
      try {
        // Construire l'URL de téléchargement
        let downloadUrl = '';
        
        if (updateData.filePath) {
          // Pour les fichiers téléversés, utiliser l'API de téléchargement
          downloadUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/requests/download/${request._id}`;
        } else if (updateData.downloadLink) {
          // Pour les liens externes, utiliser directement le lien
          downloadUrl = updateData.downloadLink;
        }
        
        // Envoyer l'email de notification
        await sendBookCompletedEmail(user, {
          ...request.toObject(),
          downloadLink: downloadUrl
        });
      } catch (emailError) {
        console.error('Erreur lors de l\'envoi de l\'email de notification:', emailError);
      }
    }
    
    res.json(request);
  } catch (error) {
    console.error('Erreur lors de l\'ajout du lien de téléchargement:', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'ajout du lien de téléchargement',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Suppression d'une demande
export const deleteRequest = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Vérifier d'abord si la demande existe et si l'utilisateur a les droits
    const request = await BookRequest.findById(id);
    if (!request) {
      return res.status(404).json({ error: 'Demande non trouvée.' });
    }

    // Vérifier que l'utilisateur est le propriétaire de la demande ou un administrateur
    if (request.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé.' });
    }

    // Supprimer la demande
    await BookRequest.findByIdAndDelete(id);
    
    res.json({ message: 'Demande supprimée avec succès.' });
  } catch (error) {
    console.error('Erreur lors de la suppression de la demande:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la suppression de la demande.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Marquer une demande comme téléchargée
export const markAsDownloaded = async (req, res) => {
  try {
    const request = await BookRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({ error: 'Demande non trouvée.' });
    }

    // Vérifier que l'utilisateur est le propriétaire de la demande ou un administrateur
    if (request.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé.' });
    }

    // Mettre à jour la date de téléchargement
    request.downloadedAt = new Date();
    await request.save();

    res.json({ 
      success: true, 
      downloadedAt: request.downloadedAt,
      message: 'Téléchargement enregistré avec succès.' 
    });
  } catch (error) {
    console.error('Erreur lors du marquage comme téléchargé:', error);
    res.status(500).json({ error: 'Erreur lors du marquage comme téléchargé.' });
  }
};