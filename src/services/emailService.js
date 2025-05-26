import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Obtenir le chemin du répertoire actuel
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chemin vers le fichier .env dans le répertoire backend
const envPath = path.resolve(__dirname, '../../.env');

// Vérifier si le fichier .env existe
if (fs.existsSync(envPath)) {
  console.log(`Chargement des variables d'environnement depuis: ${envPath}`);
  dotenv.config({ path: envPath });
} else {
  console.error(`Fichier .env introuvable à l'emplacement: ${envPath}`);
  console.log('Utilisation des variables d\'environnement système');
}

// Vérification des variables d'environnement requises
const requiredEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM_ADDRESS', 'EMAIL_FROM_NAME', 'FRONTEND_URL'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Variables d\'environnement manquantes pour le service email:', missingVars);
  console.log('Valeurs actuelles:', Object.fromEntries(
    requiredEnvVars.map(varName => [varName, process.env[varName] ? 'définie' : 'manquante'])
  ));
}

// Configuration du transporteur SMTP
const smtpConfig = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10) || 465,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
};

console.log('Configuration SMTP:', {
  ...smtpConfig,
  auth: { ...smtpConfig.auth, pass: '***' }
});

const transporter = nodemailer.createTransport(smtpConfig);

// Vérification de la connexion SMTP au démarrage
transporter.verify(function(error, success) {
  if (error) {
    console.error('Erreur de connexion SMTP:', error);
  } else {
    console.log('Serveur SMTP est prêt à envoyer des emails');
  }
});

// Envoie un email de notification de changement de mot de passe
export const sendPasswordChangedEmail = async (email, username = 'Utilisateur') => {
  if (!email || !username) {
    console.error('Paramètres manquants pour l\'envoi d\'email de changement de mot de passe:', { email, username });
    throw new Error('Paramètres manquants pour l\'envoi d\'email');
  }

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'EbookRequest'}" <${process.env.EMAIL_FROM_ADDRESS || 'noreply@votresite.com'}>`,
    to: email,
    subject: 'Votre mot de passe a été modifié',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #4CAF50;">Mot de passe modifié avec succès</h2>
        <p>Bonjour ${username},</p>
        <p>Votre mot de passe a été modifié avec succès le ${new Date().toLocaleDateString('fr-FR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}.</p>
        
        <p>Si vous n'êtes pas à l'origine de cette modification, veuillez nous contacter immédiatement.</p>
        
        <p>Cordialement,<br>L'équipe de support</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #757575;">
          <p>Cet email a été envoyé automatiquement. Merci de ne pas y répondre.</p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email de notification de changement de mot de passe envoyé à ${email}`);
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email de notification de changement de mot de passe:', error);
    throw error;
  }
};

export const sendVerificationEmail = async (email, token, username = 'Utilisateur') => {
  if (!email || !token || !username) {
    console.error('Paramètres manquants pour l\'envoi d\'email:', { email, token: token ? '***' : 'manquant', username });
    throw new Error('Paramètres manquants pour l\'envoi d\'email');
  }
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${token}`;
  
  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
    to: email,
    subject: 'Vérifiez votre adresse email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Bonjour ${username},</h2>
        <p>Merci d'avoir ajouter votre adresse email. Pour finaliser cette ajout, veuillez vérifier votre adresse email en cliquant sur le bouton ci-dessous :</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
            Vérifier mon email
          </a>
        </div>
        <p>Si le bouton ne fonctionne pas, vous pouvez copier et coller le lien suivant dans votre navigateur :</p>
        <p>${verificationUrl}</p>
        <p>Ce lien expirera dans 24 heures.</p>
        <p>A bientôt,<br>L'équipe de support de EbookRequest</p>
      </div>
    `
  };

  console.log('Envoi de l\'email de vérification à:', email);
  console.log('Options SMTP:', {
    ...mailOptions,
    from: mailOptions.from,
    to: mailOptions.to,
    subject: mailOptions.subject,
    html: mailOptions.html ? '***' : 'manquant'
  });

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email envoyé avec succès:', info.messageId);
    return info;
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email de vérification:', {
      message: error.message,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    
    // Si l'erreur est liée à l'authentification, cela peut aider à diagnostiquer
    if (error.code === 'EAUTH') {
      console.error('Erreur d\'authentification SMTP. Vérifiez vos identifiants SMTP.');
    }
    
    throw new Error(`Impossible d'envoyer l'email de vérification: ${error.message}`);
  }
};

// Envoie une notification de demande terminée
export const sendBookCompletedEmail = async (user, bookRequest) => {
  if (!user.notificationPreferences?.email?.enabled || !user.notificationPreferences?.email?.bookCompleted) {
    return; // Ne pas envoyer si les notifications par email sont désactivées
  }

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
    to: user.email,
    subject: `Votre demande de livre est prête : ${bookRequest.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Bonjour ${user.username},</h2>
        <p>Votre demande pour le livre <strong>${bookRequest.title}</strong> par ${bookRequest.author} est maintenant terminée !</p>
        <div style="text-align: center; margin: 30px 0;">
          <p>Vous pouvez accéder à votre livre depuis votre tableau de bord</a>.</p>
          <a href="${process.env.FRONTEND_URL}/dashboard" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
            Accéder au tableau de bord
          </a>
        </div>
        <p>A bientôt,<br>L'équipe de support de EbookRequest</p>
        <p>*Si ce mail atteint votre spam, veuillez le marquer comme non spam et ajouter l'adresse <a href="mailto:${process.env.EMAIL_FROM_ADDRESS}">${process.env.EMAIL_FROM_ADDRESS}</a> à votre liste d'adresses de confiance.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Erreur lors de l\'envoi de la notification de livre terminé:', error);
    throw error;
  }
};