import mongoose from 'mongoose';

// Marque une notification comme vue dans la base de données
const markNotificationAsSeen = async (requestId, notificationType = 'completed') => {
  try {
    const update = {};
    update[`notifications.${notificationType}.seen`] = true;
    update[`notifications.${notificationType}.seenAt`] = new Date();
    
    const updatedRequest = await mongoose.model('BookRequest').findByIdAndUpdate(
      requestId,
      { $set: update },
      { new: true }
    );
    
    return updatedRequest;
  } catch (error) {
    console.error('Erreur lors du marquage de la notification comme vue:', error);
    throw error;
  }
};

//Récupère les notifications non vues pour un utilisateur
const getUnseenNotifications = async (userId) => {
  try {
    const requests = await mongoose.model('BookRequest').find({
      user: userId,
      status: 'completed',
      'notifications.completed.seen': false
    });
    
    return requests;
  } catch (error) {
    console.error('Erreur lors de la récupération des notifications non vues:', error);
    throw error;
  }
};

export { markNotificationAsSeen, getUnseenNotifications };