import mongoose from 'mongoose';
import { testOllamaConnection } from '../services/recommendationService.js';
import AIRequestLog from '../models/AIRequestLog.js';

const User = mongoose.model('User');
const BookRequest = mongoose.model('BookRequest');

// Récupère les statistiques administratives
export const getAdminStats = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé. Rôle administrateur requis.'
      });
    }
    const totalUsers = await User.countDocuments({});
    const totalRequests = await BookRequest.countDocuments({});
    const pendingRequests = await BookRequest.countDocuments({ status: 'pending' });
    const completedRequests = await BookRequest.countDocuments({ status: 'completed' });
    const cancelledRequests = await BookRequest.countDocuments({ status: 'canceled' });
    const reportedRequests = await BookRequest.countDocuments({ status: 'reported' });
    const completionRate = totalRequests > 0
      ? Math.round((completedRequests / totalRequests) * 100)
      : 0;

    // Vérifier le statut d'Ollama
    const ollamaStatus = await testOllamaConnection();

    // Statistiques des requêtes IA
    const totalAIRequests = await AIRequestLog.countDocuments({});
    const successfulAIRequests = await AIRequestLog.countDocuments({ success: true });
    const failedAIRequests = await AIRequestLog.countDocuments({ success: false });
    const recommendationRequests = await AIRequestLog.countDocuments({ requestType: 'recommendation' });
    const bestsellerRequests = await AIRequestLog.countDocuments({ requestType: 'bestseller' });

    // Calculer le temps de réponse moyen
    const avgResponseTime = await AIRequestLog.aggregate([
      { $match: { success: true, responseTime: { $ne: null } } },
      { $group: { _id: null, avgTime: { $avg: '$responseTime' } } }
    ]);

    // Calculer le nombre total de tokens utilisés
    const totalTokens = await AIRequestLog.aggregate([
      { $match: { success: true, tokensUsed: { $ne: null } } },
      { $group: { _id: null, total: { $sum: '$tokensUsed' } } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers
        },
        requests: {
          total: totalRequests,
          pending: pendingRequests,
          completed: completedRequests,
          cancelled: cancelledRequests,
          reported: reportedRequests,
          completionRate: completionRate
        },
        ollama: {
          connected: ollamaStatus.connected,
          url: ollamaStatus.url,
          model: ollamaStatus.model,
          modelAvailable: ollamaStatus.modelAvailable,
          availableModels: ollamaStatus.availableModels || [],
          error: ollamaStatus.error || null
        },
        aiRequests: {
          total: totalAIRequests,
          successful: successfulAIRequests,
          failed: failedAIRequests,
          byType: {
            recommendation: recommendationRequests,
            bestseller: bestsellerRequests
          },
          avgResponseTime: avgResponseTime.length > 0 ? Math.round(avgResponseTime[0].avgTime) : 0,
          totalTokens: totalTokens.length > 0 ? totalTokens[0].total : 0,
          successRate: totalAIRequests > 0 ? Math.round((successfulAIRequests / totalAIRequests) * 100) : 0
        }
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des statistiques administratives'
    });
  }
};