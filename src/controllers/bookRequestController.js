import BookRequest from '../models/BookRequest.js';
import User from '../models/User.js';
import { sendBookCompletedEmail } from '../services/emailService.js';
import pushoverService from '../services/pushoverService.js';

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
    const { status } = req.body;
    
    if (!['pending', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }
    
    const request = await BookRequest.findByIdAndUpdate(
      id,
      { 
        status,
        ...(status === 'completed' && { completedAt: new Date() })
      },
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

// Ajout d'un lien de téléchargement à une demande
export const addDownloadLink = async (req, res) => {
  try {
    const { id } = req.params;
    const { downloadLink } = req.body;
    
    if (!downloadLink) {
      return res.status(400).json({ error: 'Le lien de téléchargement est requis' });
    }
    
    const request = await BookRequest.findByIdAndUpdate(
      id,
      { 
        downloadLink,
        status: 'completed',
        completedAt: new Date()
      },
      { new: true }
    );
    
    if (!request) {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }
    
    // Récupérer l'utilisateur pour envoyer une notification email
    const user = await User.findById(request.user);
    if (user) {
      // Envoyer une notification par email si activée
      if (user.notificationPreferences?.email?.enabled && user.notificationPreferences?.email?.bookCompleted) {
        try {
          await sendBookCompletedEmail(user, request);
        } catch (emailError) {
          console.error('Erreur lors de l\'envoi de l\'email de notification:', emailError);
        }
      }
    }
    
    res.json(request);
  } catch (error) {
    console.error('Erreur lors de l\'ajout du lien de téléchargement:', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout du lien de téléchargement' });
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