import mongoose from 'mongoose';
import Offer from '../model/OfferModel.js';
import db from '../config/db.js';

const cleanupExpiredOffers = async () => {
  console.log('Running cleanup for expired offers...');
  try {
    const now = new Date();
    const result = await Offer.deleteMany({
      $or: [
        { endTime: { $lt: now }, offerTimeType: 'flash_sale' },
        { expiry: { $lt: now } }
      ]
    });
    console.log(`Cleanup successful. Deleted ${result.deletedCount} expired offers.`);
  } catch (error) {
    console.error('Error during offer cleanup:', error);
  } finally {
    // We don't want to close the connection here if the script is run as part of the server process
  }
};

export default cleanupExpiredOffers;
