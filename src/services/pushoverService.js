import Pushover from 'node-pushover';
import PushoverConfig from '../models/PushoverConfig.js';
import fetch from 'node-fetch';

// Ajouter la méthode buffer() à la réponse
import { Readable } from 'stream';
import { Buffer } from 'buffer';

// Ajouter la méthode buffer() à la réponse
const buffer = async (readable) => {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
};

class PushoverService {
  constructor() {
    this.push = null;
    this.isConfigured = false;
    this.initialize();
  }

  async initialize() {
    try {
      const config = await PushoverConfig.findOne({});
      if (config && config.enabled && config.userKey && config.apiToken) {
        this.push = new Pushover({
          token: config.apiToken,
          user: config.userKey
        });
        this.isConfigured = true;
      }
    } catch (error) {
      console.error('Erreur lors de l\'initialisation de Pushover:', error);
      this.isConfigured = false;
    }
  }

  async updateConfig(newConfig) {
    try {
      let config = await PushoverConfig.findOne({});
      
      if (!config) {
        config = new PushoverConfig(newConfig);
      } else {
        Object.assign(config, newConfig);
      }
      
      await config.save();
      
      // Réinitialiser le client Pushover avec les nouvelles configurations
      if (config.enabled && config.userKey && config.apiToken) {
        this.push = new Pushover({
          token: config.apiToken,
          user: config.userKey
        });
        this.isConfigured = true;
      } else {
        this.isConfigured = false;
      }
      
      return config;
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la configuration Pushover:', error);
      throw error;
    }
  }

  async getConfig() {
    try {
      return await PushoverConfig.findOne({}).lean();
    } catch (error) {
      console.error('Erreur lors de la récupération de la configuration Pushover:', error);
      return null;
    }
  }

  async sendNotification(title, message, options = {}) {
    if (!this.isConfigured || !this.push) {
      console.log('Pushover n\'est pas configuré. Notification non envoyée.');
      return { success: false, message: 'Pushover non configuré' };
    }

    const { attachment, ...pushOptions } = options;
    
    return new Promise((resolve) => {
      const callback = (error, result) => {
        if (error) {
          console.error('Erreur lors de l\'envoi de la notification Pushover:', error);
          resolve({ success: false, error });
        } else {
          console.log('Notification Pushover envoyée avec succès:', result);
          resolve({ success: true, result });
        }
      };

      if (attachment) {
        this.push.send({
          ...pushOptions,
          title,
          message,
          file: attachment,
        }, callback);
      } else {
        this.push.send(title, message, callback);
      }
    });
  }

  async notifyNewBookRequest(bookRequest, user) {
    if (!this.isConfigured) return;

    try {
      const config = await this.getConfig();
      if (!config || !config.notifyOnNewRequest) return;

      const title = '📚 Nouvelle demande de livre';
      const message = `
      📖 Titre: ${bookRequest.title}
      ✍️ Auteur: ${bookRequest.author}
      👤 Demandé par: ${user.username}
      📅 Date: ${new Date(bookRequest.createdAt).toLocaleString()}
      🔗 Lien: ${bookRequest.link || 'Non fourni'}
      `;
      
      // Options pour la notification
      const options = {};
      
      // Ajouter la couverture du livre comme pièce jointe si disponible
      if (bookRequest.thumbnail) {
        try {
          // Télécharger l'image depuis l'URL
          const response = await fetch(bookRequest.thumbnail);
          if (response.ok) {
            const responseBuffer = await buffer(Readable.fromWeb(response.body));
            options.attachment = {
              name: 'cover.jpg',
              data: responseBuffer,
              contentType: response.headers.get('content-type') || 'image/jpeg'
            };
          }
        } catch (error) {
          console.error('Erreur lors du téléchargement de la couverture:', error);
        }
      }

      // Si une image de couverture est disponible, l'ajouter en pièce jointe
      if (bookRequest.coverImage) {
        options.file = {
          name: 'cover.jpg',
          data: bookRequest.coverImage
        };
      }

      // Ajouter les options de base
      const notificationOptions = {
        priority: 1,
        sound: 'magic',
        title: title.trim(),
        message: message.trim(),
        ...options
      };

      return await this.sendNotification(title, message, notificationOptions);
    } catch (error) {
      console.error('Erreur lors de l\'envoi de la notification de nouvelle demande:', error);
      return { success: false, error };
    }
  }
}

export default new PushoverService();