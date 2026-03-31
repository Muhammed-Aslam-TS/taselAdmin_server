#!/usr/bin/env node
import dotenv from "dotenv";
import connectDB from "../config/db.js";
import { Product } from "../model/product.js";

dotenv.config();

async function run() {
  await connectDB();
  console.log("Starting slug index cleanup...");

  try {
    const indexes = await Product.collection.indexes();
    const hasSlugIndex = indexes.some(idx => idx.name === "slug_1");

    if (hasSlugIndex) {
      console.log("Found legacy 'slug_1' index. Dropping it...");
      await Product.collection.dropIndex("slug_1");
      console.log("✅ Successfully dropped 'slug_1' index.");
    } else {
      console.log("No 'slug_1' index found. Nothing to do.");
    }
  } catch (error) {
    console.error("❌ Error during index cleanup:", error);
  }

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
