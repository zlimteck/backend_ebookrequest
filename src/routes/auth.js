import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

// Vérifier la validité du token
router.get('/check-token', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    res.json({ user });
  } catch (error) {
    console.error('Erreur lors de la vérification du token:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la vérification du token' });
  }
});

// Inscription (admin seulement)
router.post('/register', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    // Validation des champs
    if (!username || !password) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }
    
    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Ce nom d\'utilisateur est déjà utilisé' });
    }
    
    // Hacher le mot de passe
    const hash = await bcrypt.hash(password, 10);
    
    // Créer l'utilisateur
    const user = new User({ 
      username, 
      password: hash, 
      role: role || 'user' 
    });
    
    await user.save();
    
    // Ne pas renvoyer le mot de passe
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.status(201).json({
      success: true,
      message: 'Utilisateur créé avec succès',
      user: userResponse
    });
    
  } catch (err) {
    console.error('Erreur lors de la création de l\'utilisateur:', err);
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({ error: messages.join('. ') });
    }
    
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Ce nom d\'utilisateur est déjà utilisé' });
    }
    
    res.status(500).json({ error: 'Erreur lors de la création de l\'utilisateur' });
  }
});

// Connexion
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis.' });
    }
    
    // Récupérer l'utilisateur avec le mot de passe
    const user = await User.findOne({ username }).select('+password');
    
    if (!user) {
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }
    
    const valid = await bcrypt.compare(password, user.password);
    
    if (!valid) {
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }
    
    // Mise à jour de la dernière connexion
    user.lastLogin = new Date();
    user.lastActivity = new Date();
    await user.save();
    
    const token = jwt.sign({ 
      id: user._id, 
      role: user.role 
    }, JWT_SECRET, { expiresIn: '30d' });
    
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.json({ 
      token, 
      role: user.role,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin,
        lastActivity: user.lastActivity
      }
    });
  } catch (err) {
    console.error('Erreur lors de la connexion:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

export default router;