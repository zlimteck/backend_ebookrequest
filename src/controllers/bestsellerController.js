import Bestseller from '../models/Bestseller.js';
import { clearTrendingBooksCache } from '../services/trendingBooksService.js';

// Récupérer tous les bestsellers (avec filtre optionnel par catégorie)
export const getBestsellers = async (req, res) => {
  try {
    const { category } = req.query;
    const filter = { active: true };

    if (category && category !== 'all') {
      filter.category = category;
    }

    const bestsellers = await Bestseller.find(filter)
      .sort({ order: 1, createdAt: -1 })
      .populate('addedBy', 'username');

    res.status(200).json({
      success: true,
      data: bestsellers
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des bestsellers:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des bestsellers'
    });
  }
};

// Ajouter un nouveau bestseller
export const addBestseller = async (req, res) => {
  try {
    const { title, author, category, order } = req.body;

    if (!title || !author || !category) {
      return res.status(400).json({
        success: false,
        error: 'Titre, auteur et catégorie requis'
      });
    }

    const bestseller = new Bestseller({
      title,
      author,
      category,
      order: order || 0,
      addedBy: req.user.id
    });

    await bestseller.save();

    // Vider le cache pour forcer le rafraîchissement
    clearTrendingBooksCache();

    res.status(201).json({
      success: true,
      data: bestseller,
      message: 'Bestseller ajouté avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de l\'ajout du bestseller:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'ajout du bestseller'
    });
  }
};

// Mettre à jour un bestseller
export const updateBestseller = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, author, category, order, active } = req.body;

    const bestseller = await Bestseller.findByIdAndUpdate(
      id,
      { title, author, category, order, active },
      { new: true, runValidators: true }
    );

    if (!bestseller) {
      return res.status(404).json({
        success: false,
        error: 'Bestseller non trouvé'
      });
    }

    // Vider le cache pour forcer le rafraîchissement
    clearTrendingBooksCache();

    res.status(200).json({
      success: true,
      data: bestseller,
      message: 'Bestseller mis à jour avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du bestseller:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour du bestseller'
    });
  }
};

// Supprimer un bestseller
export const deleteBestseller = async (req, res) => {
  try {
    const { id } = req.params;

    const bestseller = await Bestseller.findByIdAndDelete(id);

    if (!bestseller) {
      return res.status(404).json({
        success: false,
        error: 'Bestseller non trouvé'
      });
    }

    // Vider le cache pour forcer le rafraîchissement
    clearTrendingBooksCache();

    res.status(200).json({
      success: true,
      message: 'Bestseller supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du bestseller:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression du bestseller'
    });
  }
};

// Réorganiser l'ordre des bestsellers
export const reorderBestsellers = async (req, res) => {
  try {
    const { bestsellers } = req.body; // Array of { id, order }

    if (!Array.isArray(bestsellers)) {
      return res.status(400).json({
        success: false,
        error: 'Format invalide'
      });
    }

    // Mettre à jour l'ordre de chaque bestseller
    const updates = bestsellers.map(({ id, order }) =>
      Bestseller.findByIdAndUpdate(id, { order })
    );

    await Promise.all(updates);

    // Vider le cache pour forcer le rafraîchissement
    clearTrendingBooksCache();

    res.status(200).json({
      success: true,
      message: 'Ordre mis à jour avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la réorganisation:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la réorganisation'
    });
  }
};