import mongoose from 'mongoose';

const bookRequestSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  username: { 
    type: String, 
    required: true 
  },
  author: { 
    type: String, 
    required: true 
  },
  title: { 
    type: String, 
    required: true 
  },
  link: { 
    type: String, 
    required: true 
  },
  thumbnail: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  pageCount: {
    type: Number,
    default: 0
  },
  downloadLink: { 
    type: String,
    default: ''
  },
  status: { 
    type: String, 
    enum: ['pending', 'completed'],
    default: 'pending',
    required: true 
  },
  // Suivi des téléchargements
  downloadedAt: {
    type: Date,
    default: null
  },
  // Suivi des notifications vues par l'utilisateur
  notifications: {
    completed: {
      seen: { type: Boolean, default: false },
      seenAt: { type: Date }
    },
  },
  completedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
}, {
  timestamps: true
});

// Index pour les requêtes fréquentes
bookRequestSchema.index({ status: 1 });
bookRequestSchema.index({ createdAt: -1 });

export default mongoose.model('BookRequest', bookRequestSchema);