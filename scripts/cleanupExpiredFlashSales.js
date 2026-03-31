import mongoose from 'mongoose';
import Offer from '../model/OfferModel.js';
import db from '../config/db.js';

const cleanupExpiredFlashSales = async () => {
  console.log('Running cleanup for expired flash sales...');
  try {
    const now = new Date();
    const result = await Offer.deleteMany({
      offerTimeType: 'flash_sale',
      endTime: { $lt: now },
    });
    console.log(`Cleanup successful. Deleted ${result.deletedCount} expired flash sale offers.`);
  } catch (error) {
    console.error('Error during flash sale cleanup:', error);
  } finally {
    // We don't want to close the connection here if the script is run as part of the server process
  }
};

export default cleanupExpiredFlashSales;
