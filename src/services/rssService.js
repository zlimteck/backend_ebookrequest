import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';

const RSS_FEED_URL = process.env.RSS_FEED_URL;

function normalizeString(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Retirer les accents
    .replace(/['']/g, ' ') // Remplacer apostrophes par espaces
    .replace(/[^a-z0-9\s]/g, '') // Retirer la ponctuation
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBookInfo(rssTitle) {
  if (!rssTitle) return { title: '', author: '' };

  // Retirer les informations de format (epub, pdf, etc.) et langue
  let cleaned = rssTitle
    .replace(/\.(epub|pdf|mobi|azw3|cbz|cbr)/gi, '')
    .replace(/\[?(fr|en|es|de)\]?/gi, '')
    .trim();

  // Diviser par tirets ou autres séparateurs
  const parts = cleaned.split(/\s*[-–—]\s*/);

  return {
    title: parts[0] || '',
    author: parts[1] || '',
    fullText: cleaned
  };
}

function calculateMatchScore(searchTitle, searchAuthor, rssTitle, rssAuthor, rssFullText) {
  const normSearchTitle = normalizeString(searchTitle);
  const normSearchAuthor = normalizeString(searchAuthor);
  const normRssTitle = normalizeString(rssTitle);
  const normRssAuthor = normalizeString(rssAuthor);
  const normFullText = normalizeString(rssFullText);

  let score = 0;

  // Fonction pour calculer le pourcentage de mots communs
  const calculateWordOverlap = (str1, str2) => {
    if (!str1 || !str2) return 0;
    const words1 = new Set(str1.split(' ').filter(w => w.length > 2));
    const words2 = new Set(str2.split(' ').filter(w => w.length > 2));
    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = [...words1].filter(w => words2.has(w));
    return (intersection.length / Math.min(words1.size, words2.size)) * 100;
  };

  // Correspondance du titre
  if (normSearchTitle && normRssTitle) {
    if (normSearchTitle === normRssTitle) {
      // Correspondance exacte du titre (60 points)
      score += 60;
    } else if (normRssTitle.includes(normSearchTitle) || normSearchTitle.includes(normRssTitle)) {
      // L'un contient l'autre (50 points)
      score += 50;
    } else if (normFullText.includes(normSearchTitle)) {
      // Titre trouvé dans le texte complet (40 points)
      score += 40;
    } else {
      // Calcul basé sur les mots communs
      const overlap = calculateWordOverlap(normSearchTitle, normRssTitle);
      if (overlap >= 70) {
        score += 45;
      } else if (overlap >= 50) {
        score += 35;
      } else if (overlap >= 30) {
        score += 25;
      }
    }
  }

  // Correspondance de l'auteur
  if (normSearchAuthor && (normRssAuthor || normFullText)) {
    if (normRssAuthor && normSearchAuthor === normRssAuthor) {
      // Correspondance exacte de l'auteur (40 points)
      score += 40;
    } else if (normRssAuthor && (normRssAuthor.includes(normSearchAuthor) || normSearchAuthor.includes(normRssAuthor))) {
      // L'un contient l'autre (35 points)
      score += 35;
    } else if (normFullText.includes(normSearchAuthor)) {
      // Auteur trouvé dans le texte complet (30 points)
      score += 30;
    } else if (normRssAuthor) {
      // Calcul basé sur les mots communs du nom d'auteur
      const overlap = calculateWordOverlap(normSearchAuthor, normRssAuthor);
      if (overlap >= 70) {
        score += 35;
      } else if (overlap >= 50) {
        score += 25;
      }
    }
  }

  return score;
}

// Récupère et parse le flux RSS
export async function fetchRSSFeed() {
  try {
    const response = await fetch(RSS_FEED_URL, {
      headers: {
        'User-Agent': 'EbookRequest/1.0'
      },
      timeout: 10000 // 10 secondes timeout
    });

    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }

    const xmlText = await response.text();
    const result = await parseStringPromise(xmlText, {
      explicitArray: false,
      trim: true
    });

    return result.rss.channel.item || [];
  } catch (error) {
    console.error('Erreur lors de la récupération du flux RSS:', error);
    throw error;
  }
}

// Vérifie si un livre est disponible dans le flux RSS
export async function checkBookAvailability(title, author) {
  try {
    const items = await fetchRSSFeed();

    if (!Array.isArray(items)) {
      return {
        available: false,
        confidence: 'unknown',
        message: 'Impossible de vérifier la disponibilité pour le moment'
      };
    }

    let bestMatch = null;
    let bestScore = 0;

    // Parcourir tous les items du flux RSS
    console.log(`\n[RSS Check] Recherche de: "${title}" par "${author}"`);
    console.log(`[RSS Check] Nombre d'items dans le flux: ${items.length}`);

    for (const item of items) {
      const rssTitle = item.title || '';
      const { title: extractedTitle, author: extractedAuthor, fullText } = extractBookInfo(rssTitle);

      const score = calculateMatchScore(title, author, extractedTitle, extractedAuthor, fullText);

      // Log des meilleures correspondances
      if (score >= 40) {
        console.log(`[RSS Check] Score ${score}: "${rssTitle}" (titre: "${extractedTitle}", auteur: "${extractedAuthor}")`);
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          rssTitle: rssTitle,
          extractedTitle: extractedTitle,
          extractedAuthor: extractedAuthor,
          link: item.link,
          pubDate: item.pubDate,
          score: score
        };
      }
    }

    console.log(`[RSS Check] Meilleur score: ${bestScore}${bestMatch ? ` - "${bestMatch.rssTitle}"` : ''}\n`);

    // Seuils ajustés pour une meilleure détection
    if (bestScore >= 75) {
      return {
        available: true,
        confidence: 'high',
        message: 'Ce livre semble disponible ! Votre demande devrait être traitée rapidement.',
        match: bestMatch,
        score: bestScore
      };
    } else if (bestScore >= 45) {
      return {
        available: true,
        confidence: 'medium',
        message: 'Un livre similaire semble disponible. Votre demande pourrait être traitée rapidement.',
        match: bestMatch,
        score: bestScore
      };
    } else {
      return {
        available: false,
        confidence: 'low',
        message: 'Ce livre ne semble pas immédiatement disponible. Le traitement pourrait prendre plus de temps.',
        match: bestMatch,
        score: bestScore
      };
    }

  } catch (error) {
    console.error('Erreur lors de la vérification de disponibilité:', error);
    return {
      available: false,
      confidence: 'unknown',
      message: 'Impossible de vérifier la disponibilité pour le moment',
      error: error.message
    };
  }
}