import fetch from 'node-fetch';

const XTHOR_API_URL = process.env.XTHOR_API_URL;
const XTHOR_PASSKEY = process.env.XTHOR_PASSKEY;
const XTHOR_CATEGORIES = process.env.XTHOR_CATEGORIES || '24,116';

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

function extractBookInfo(torrentName) {
  if (!torrentName) return { title: '', author: '', fullText: '' };

  // Retirer l'année et tout ce qui suit (format, langue, etc.)
  let cleaned = torrentName.replace(/\.\d{4}\..*$/i, '');

  // Si pas d'année trouvée, essayer d'autres patterns
  if (cleaned === torrentName) {
    cleaned = torrentName
      .replace(/\.(FRENCH|ENGLISH|FR|EN)\..*/gi, '')
      .replace(/\.(epub|pdf|mobi|azw3|cbz|cbr)$/gi, '')
      .replace(/\-NoTag$/i, '');
  }

  // Convertir les points en espaces pour le fullText
  const fullText = cleaned.replace(/\./g, ' ');

  // Essayer de trouver l'auteur en cherchant les 2 derniers mots qui ressemblent à un nom
  const parts = cleaned.split('.');

  let title = '';
  let author = '';

  // Chercher les 2 derniers segments qui sont probablement le prénom et nom
  let authorParts = [];
  for (let i = parts.length - 1; i >= 0 && authorParts.length < 2; i--) {
    const part = parts[i];
    if (part && part.length > 2 &&
        part[0] === part[0].toUpperCase() &&
        !part.match(/^T\d+$/i)) { // Pas un tome
      authorParts.unshift(part);
    }
  }

  if (authorParts.length >= 2) {
    author = authorParts.join(' ');
    const authorIndex = parts.indexOf(authorParts[0]);
    title = parts.slice(0, authorIndex).join(' ');
  } else if (authorParts.length === 1) {
    author = authorParts[0];
    const authorIndex = parts.indexOf(authorParts[0]);
    title = parts.slice(0, authorIndex).join(' ');
  } else {
    if (parts.length >= 3) {
      author = parts.slice(-2).join(' ');
      title = parts.slice(0, -2).join(' ');
    } else {
      title = fullText;
    }
  }

  return {
    title: title.trim(),
    author: author.trim(),
    fullText: fullText.trim()
  };
}

function calculateMatchScore(searchTitle, searchAuthor, torrentTitle, torrentAuthor, torrentFullText) {
  const normSearchTitle = normalizeString(searchTitle);
  const normSearchAuthor = normalizeString(searchAuthor);
  const normTorrentTitle = normalizeString(torrentTitle);
  const normTorrentAuthor = normalizeString(torrentAuthor);
  const normFullText = normalizeString(torrentFullText);

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
  if (normSearchTitle && normTorrentTitle) {
    if (normSearchTitle === normTorrentTitle) {
      score += 60;
    } else if (normTorrentTitle.includes(normSearchTitle) || normSearchTitle.includes(normTorrentTitle)) {
      score += 50;
    } else if (normFullText.includes(normSearchTitle)) {
      score += 40;
    } else {
      const overlap = calculateWordOverlap(normSearchTitle, normTorrentTitle);
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
  if (normSearchAuthor && (normTorrentAuthor || normFullText)) {
    if (normTorrentAuthor && normSearchAuthor === normTorrentAuthor) {
      score += 40;
    } else if (normTorrentAuthor && (normTorrentAuthor.includes(normSearchAuthor) || normSearchAuthor.includes(normTorrentAuthor))) {
      score += 35;
    } else if (normFullText.includes(normSearchAuthor)) {
      score += 30;
    } else if (normTorrentAuthor) {
      const overlap = calculateWordOverlap(normSearchAuthor, normTorrentAuthor);
      if (overlap >= 70) {
        score += 35;
      } else if (overlap >= 50) {
        score += 25;
      }
    }
  }

  return score;
}

export async function fetchXthorTorrents(searchQuery = '') {
  try {
    let url = `${XTHOR_API_URL}?passkey=${XTHOR_PASSKEY}&category=${XTHOR_CATEGORIES.replace(/,/g, '+')}`;

    // Ajouter le paramètre de recherche si fourni
    if (searchQuery) {
      url += `&search=${encodeURIComponent(searchQuery)}`;
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'EbookRequest/1.0'
      },
      timeout: 15000
    });

    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }

    const data = await response.json();

    if (data.error && data.error.code !== 0) {
      throw new Error(`Erreur API Xthor: ${data.error.descr}`);
    }

    return data.torrents || [];
  } catch (error) {
    console.error('Erreur lors de la récupération des torrents Xthor:', error);
    throw error;
  }
}

export async function checkBookAvailability(title, author) {
  try {
    console.log(`\n[Xthor Check] Recherche de: "${title}" par "${author}"`);

    // Effectuer plusieurs recherches avec différents termes
    const searchTerms = [
      author, // Recherche par auteur
      title.split(' ').slice(0, 3).join(' '), // Premiers mots du titre
      `${author} ${title.split(' ')[0]}` // Auteur + premier mot du titre
    ].filter(term => term.length > 2);

    let allTorrents = [];
    const seenIds = new Set();

    // Récupérer les torrents pour chaque terme de recherche
    for (const searchTerm of searchTerms) {
      try {
        const torrents = await fetchXthorTorrents(searchTerm);
        console.log(`[Xthor Check] Recherche "${searchTerm}": ${torrents.length} résultats`);

        // Éviter les doublons
        for (const torrent of torrents) {
          if (!seenIds.has(torrent.id)) {
            seenIds.add(torrent.id);
            allTorrents.push(torrent);
          }
        }
      } catch (error) {
        console.warn(`[Xthor Check] Erreur recherche "${searchTerm}":`, error.message);
      }
    }

    console.log(`[Xthor Check] Total unique de torrents: ${allTorrents.length}`);

    let bestMatch = null;
    let bestScore = 0;

    for (const torrent of allTorrents) {
      const torrentName = torrent.name || '';
      const { title: extractedTitle, author: extractedAuthor, fullText } = extractBookInfo(torrentName);

      const score = calculateMatchScore(title, author, extractedTitle, extractedAuthor, fullText);

      // Log des meilleures correspondances
      if (score >= 30) {
        console.log(`[Xthor Check] Score ${score}: "${torrentName}"`);
        console.log(`  ↳ Extrait - Titre: "${extractedTitle}", Auteur: "${extractedAuthor}"`);
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          torrentName: torrentName,
          extractedTitle: extractedTitle,
          extractedAuthor: extractedAuthor,
          torrentId: torrent.id,
          seeders: torrent.seeders,
          leechers: torrent.leechers,
          size: torrent.size,
          score: score
        };
      }
    }

    console.log(`[Xthor Check] Meilleur score: ${bestScore}${bestMatch ? ` - "${bestMatch.torrentName}"` : ''}\n`);

    // Seuils ajustés pour une meilleure détection (très permissifs)
    if (bestScore >= 65) {
      return {
        available: true,
        confidence: 'high',
        message: 'Ce livre est disponible ! Votre demande devrait être traitée rapidement.',
        match: bestMatch,
        score: bestScore
      };
    } else if (bestScore >= 25) {
      return {
        available: true,
        confidence: 'medium',
        message: 'Un livre similaire est disponible. Votre demande pourrait être traitée rapidement.',
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
    console.error('Erreur lors de la vérification de disponibilité Xthor:', error);
    return {
      available: false,
      confidence: 'unknown',
      message: 'Impossible de vérifier la disponibilité pour le moment',
      error: error.message
    };
  }
}