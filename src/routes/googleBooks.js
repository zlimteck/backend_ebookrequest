import express from 'express';
import axios from 'axios';

const router = express.Router();
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY || '';

// Recherche de livres via Google Books API
router.get('/search', async (req, res) => {
  try {
    const { q, maxResults = 5 } = req.query;

    if (!q) {
      return res.status(400).json({ message: 'Le paramètre de recherche est requis' });
    }

    const response = await axios.get(
      'https://www.googleapis.com/books/v1/volumes',
      {
        params: {
          q,
          maxResults: Math.min(parseInt(maxResults), 10), // Limite à 10 résultats max
          key: GOOGLE_BOOKS_API_KEY,
          printType: 'books',
          langRestrict: 'fr',
          orderBy: 'relevance'
        }
      }
    );

    // Formater la réponse pour ne renvoyer que les données nécessaires
    const formattedResults = (response.data.items || []).map(book => ({
      id: book.id,
      volumeInfo: {
        title: book.volumeInfo.title,
        authors: book.volumeInfo.authors || ['Auteur inconnu'],
        publishedDate: book.volumeInfo.publishedDate,
        description: book.volumeInfo.description || 'Aucune description disponible',
        pageCount: book.volumeInfo.pageCount || 0,
        categories: book.volumeInfo.categories || [],
        imageLinks: book.volumeInfo.imageLinks || {},
        language: book.volumeInfo.language || 'fr',
        previewLink: book.volumeInfo.previewLink || ''
      }
    }));

    res.json(formattedResults);
  } catch (error) {
    console.error('Erreur lors de la recherche Google Books:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la recherche de livres',
      error: error.message 
    });
  }
});

export default router;