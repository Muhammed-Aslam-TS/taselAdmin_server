import mongoose from 'mongoose';
import SubscriptionPlan from '../model/subscriptionPlans.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async() => {
  const plans = await SubscriptionPlan.find({});
  process.stdout.write(JSON.stringify(plans, null, 2));
  process.exit(0);
});
