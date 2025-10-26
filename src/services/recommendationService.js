import axios from 'axios';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import AIRequestLog from '../models/AIRequestLog.js';

dotenv.config();

const OLLAMA_URL = process.env.OLLAMA_URL;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL;
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY;

// Génère des recommandations de livres basées sur l'historique des demandes
export const generateRecommendations = async (bookRequests, limit = 5, userId = null, username = 'anonymous') => {
  const startTime = Date.now();
  let logEntry = null;

  try {
    // Vérifier qu'il y a des demandes de livres
    if (!bookRequests || bookRequests.length === 0) {
      return {
        recommendations: [],
        message: "Vous n'avez pas encore de demandes de livres. Commencez par demander quelques livres pour obtenir des recommandations personnalisées !"
      };
    }

    // Préparer les données pour l'IA
    const booksData = bookRequests.map(req => ({
      title: req.title,
      author: req.author,
      description: req.description || '',
      pageCount: req.pageCount || 0
    }));

    // Créer le prompt pour Ollama
    const prompt = buildRecommendationPrompt(booksData, limit);

    console.log('Envoi de la requête à Ollama...', { model: OLLAMA_MODEL, url: OLLAMA_URL });

    // Appel à l'API Ollama
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: OLLAMA_MODEL,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40
      }
    }, {
      timeout: 60000 // 60 secondes timeout
    });

    console.log('Réponse reçue de Ollama');

    const responseTime = Date.now() - startTime;

    // Parser la réponse
    let recommendations = parseRecommendations(response.data.response);

    // Enrichir avec les couvertures de Google Books
    recommendations = await enrichWithGoogleBooksCovers(recommendations);

    // Logger la requête réussie
    if (userId) {
      try {
        logEntry = await AIRequestLog.create({
          userId,
          username,
          requestType: 'recommendation',
          model: OLLAMA_MODEL,
          success: true,
          responseTime,
          tokensUsed: response.data.eval_count || null
        });
      } catch (logError) {
        console.error('Erreur lors du logging de la requête IA:', logError.message);
      }
    }

    return {
      recommendations,
      message: recommendations.length > 0
        ? `Basé sur vos ${bookRequests.length} demande(s) de livres`
        : "Impossible de générer des recommandations pour le moment"
    };

  } catch (error) {
    console.error('Erreur lors de la génération de recommandations:', error.message);

    const responseTime = Date.now() - startTime;

    // Logger la requête échouée
    if (userId) {
      try {
        await AIRequestLog.create({
          userId,
          username,
          requestType: 'recommendation',
          model: OLLAMA_MODEL,
          success: false,
          errorMessage: error.message,
          responseTime
        });
      } catch (logError) {
        console.error('Erreur lors du logging de la requête IA:', logError.message);
      }
    }

    if (error.code === 'ECONNREFUSED') {
      throw new Error('Impossible de se connecter au serveur Ollama. Vérifiez que le service est actif.');
    }

    if (error.code === 'ETIMEDOUT') {
      throw new Error('Le serveur Ollama met trop de temps à répondre. Réessayez plus tard.');
    }

    throw new Error(`Erreur lors de la génération de recommandations: ${error.message}`);
  }
};

// Construit le prompt pour Ollama
function buildRecommendationPrompt(books, limit) {
  const booksList = books.map((book, index) =>
    `${index + 1}. "${book.title}" par ${book.author}${book.description ? ` - ${book.description.substring(0, 200)}` : ''}`
  ).join('\n');

  return `Tu es un expert en littérature qui recommande des livres. Voici l'historique de lecture d'un utilisateur :

${booksList}

Basé sur cet historique, recommande exactement ${limit} livres différents qui pourraient intéresser cet utilisateur. Pour chaque recommandation, fournis les informations au format JSON suivant :

{
  "title": "Titre du livre",
  "author": "Auteur du livre",
  "reason": "Raison de cette recommandation en 1-2 phrases courtes",
  "genre": "Genre principal du livre"
}

Réponds UNIQUEMENT avec un tableau JSON valide contenant ${limit} recommandations, sans texte supplémentaire avant ou après. Format attendu :
[
  { "title": "...", "author": "...", "reason": "...", "genre": "..." },
  ...
]`;
}

/**
 * Parse la réponse de Ollama pour extraire les recommandations
 * @param {string} response - Réponse brute de Ollama
 * @returns {Array} Liste de recommandations parsées
 */
function parseRecommendations(response) {
  try {
    // Nettoyer la réponse
    let cleanedResponse = response.trim();

    // Extraire le JSON si entouré de texte
    const jsonMatch = cleanedResponse.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      cleanedResponse = jsonMatch[0];
    }

    // Parser le JSON
    const recommendations = JSON.parse(cleanedResponse);

    // Valider et formater les recommandations
    if (Array.isArray(recommendations)) {
      return recommendations
        .filter(rec => rec.title && rec.author && rec.reason)
        .map(rec => ({
          title: rec.title.trim(),
          author: rec.author.trim(),
          reason: rec.reason.trim(),
          genre: rec.genre?.trim() || 'Non spécifié',
          id: generateRecommendationId(rec.title, rec.author)
        }));
    }

    console.warn('Format de réponse inattendu de Ollama:', response.substring(0, 200));
    return [];

  } catch (error) {
    console.error('Erreur lors du parsing des recommandations:', error.message);
    console.error('Réponse brute:', response.substring(0, 500));

    // Fallback: essayer d'extraire manuellement
    return extractRecommendationsManually(response);
  }
}

// Extraction manuelle des recommandations si le JSON parsing échoue
function extractRecommendationsManually(response) {
  const recommendations = [];

  try {
    // Chercher des patterns de type "Titre" par Auteur
    const patterns = [
      /["']([^"']+)["']\s+(?:par|by)\s+([^,.\n]+)/gi,
      /(\d+)\.\s*["']?([^"'\n]+)["']?\s*-\s*([^,\n]+)/gi
    ];

    for (const pattern of patterns) {
      const matches = [...response.matchAll(pattern)];
      for (const match of matches) {
        if (match.length >= 3) {
          recommendations.push({
            title: match[1].trim(),
            author: match[2].trim(),
            reason: "Recommandé sur la base de vos lectures précédentes",
            genre: "Non spécifié",
            id: generateRecommendationId(match[1], match[2])
          });
        }
      }
    }
  } catch (error) {
    console.error('Erreur extraction manuelle:', error.message);
  }

  return recommendations.slice(0, 5);
}

// Génère un ID unique pour une recommandation
function generateRecommendationId(title, author) {
  const str = `${title}-${author}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  return str.substring(0, 50);
}

// Enrichit les recommandations avec les couvertures de Google Books
async function enrichWithGoogleBooksCovers(recommendations) {
  if (!GOOGLE_BOOKS_API_KEY || recommendations.length === 0) {
    return recommendations;
  }

  const enrichedRecommendations = await Promise.all(
    recommendations.map(async (rec) => {
      try {
        const query = `intitle:${encodeURIComponent(rec.title)}+inauthor:${encodeURIComponent(rec.author)}`;
        const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&key=${GOOGLE_BOOKS_API_KEY}&maxResults=1`;

        const response = await axios.get(url, { timeout: 5000 });

        if (response.data.items && response.data.items.length > 0) {
          const book = response.data.items[0];
          const thumbnail = book.volumeInfo?.imageLinks?.thumbnail?.replace('http://', 'https://');
          const link = book.volumeInfo?.infoLink || `https://books.google.fr/books?id=${book.id}`;

          return {
            ...rec,
            thumbnail: thumbnail || null,
            link: link || null,
            description: book.volumeInfo?.description || rec.reason
          };
        }
      } catch (error) {
        console.error(`Erreur lors de la récupération de la couverture pour "${rec.title}":`, error.message);
      }

      return rec;
    })
  );

  return enrichedRecommendations;
}

// Test de connectivité avec Ollama
export const testOllamaConnection = async () => {
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`, {
      timeout: 5000
    });

    const models = response.data.models || [];
    const modelExists = models.some(m => m.name.includes(OLLAMA_MODEL.split(':')[0]));

    return {
      connected: true,
      url: OLLAMA_URL,
      model: OLLAMA_MODEL,
      modelAvailable: modelExists,
      availableModels: models.map(m => m.name)
    };
  } catch (error) {
    return {
      connected: false,
      url: OLLAMA_URL,
      model: OLLAMA_MODEL,
      error: error.message
    };
  }
};