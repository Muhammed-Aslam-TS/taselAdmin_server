import mongoose from 'mongoose';
import Owner from '../model/OwnerModels.js';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async() => {
  const owners = await Owner.find({});
  process.stdout.write(JSON.stringify(owners, null, 2));
  process.exit(0);
});
