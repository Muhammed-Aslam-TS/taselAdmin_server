#!/usr/bin/env node
import dotenv from "dotenv";
import connectDB from "../config/db.js";
import Owner from "../model/OwnerModels.js";

dotenv.config();

async function normalizeDomain(d) {
  if (!d) return null;
  return String(d).toLowerCase().trim();
}

async function run() {
  await connectDB();
  console.log("Starting owners migration...");

  const owners = await Owner.find().lean();
  console.log(`Found ${owners.length} owner(s)`);

  let updated = 0;
  for (const o of owners) {
    const updates = {};

    // ensure simple address fields exist
    if (typeof o.companyName === "undefined") updates.companyName = null;
    if (typeof o.companyAddress === "undefined") updates.companyAddress = null;
    if (typeof o.streetAddress === "undefined") updates.streetAddress = null;
    if (typeof o.city === "undefined") updates.city = null;
    if (typeof o.state === "undefined") updates.state = null;
    if (typeof o.country === "undefined") updates.country = "India";
    if (typeof o.pincode === "undefined") updates.pincode = null;

    // domains
    const primary = await normalizeDomain(o.primaryDomain);
    if (primary !== (o.primaryDomain || null)) updates.primaryDomain = primary;

    if (!Array.isArray(o.storeDomains)) {
      updates.storeDomains = Array.isArray(o.storeDomains) ? o.storeDomains : [];
    } else {
      const normalized = o.storeDomains
        .map((d) => d && String(d).toLowerCase().trim())
        .filter(Boolean);
      // only set if different
      if (JSON.stringify(normalized) !== JSON.stringify(o.storeDomains)) updates.storeDomains = normalized;
    }

    // files
    if (typeof o.logo === "undefined") updates.logo = null;
    if (typeof o.idProof === "undefined") updates.idProof = null;

    // settings
    if (typeof o.settings === "undefined") updates.settings = { allowGuestCheckout: true, defaultCurrency: "INR" };
    else {
      const s = { ...(o.settings || {}) };
      if (typeof s.allowGuestCheckout === "undefined") s.allowGuestCheckout = true;
      if (typeof s.defaultCurrency === "undefined") s.defaultCurrency = "INR";
      if (JSON.stringify(s) !== JSON.stringify(o.settings)) updates.settings = s;
    }

    // metadata & flags
    if (typeof o.isActive === "undefined") updates.isActive = true;
    if (typeof o.metadata === "undefined") updates.metadata = {};

    if (Object.keys(updates).length) {
      await Owner.updateOne({ _id: o._id }, { $set: updates });
      updated++;
      console.log(`Updated owner ${o._id}: ${Object.keys(updates).join(", ")}`);
    }
  }

  // ensure indexes are created/synced
  try {
    await Owner.syncIndexes();
    console.log("Indexes synced for Owner model");
  } catch (e) {
    console.warn("Failed to sync indexes:", e.message);
  }

  console.log(`Migration complete. Owners processed: ${owners.length}, updated: ${updated}`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
