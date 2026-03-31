// import dns from "dns";
// import Owner from "../../model/OwnerModels.js";
// import { asyncHandler } from "../../utils/asyncHandler.js";
// import { ApiResponse } from "../../utils/ApiResponse.js";
// import { ApiError } from "../../utils/ApiError.js";
// import { exec } from "child_process";

// // --- Constants ---
// const CNAME_TARGET = process.env.CNAME_TARGET || "shops.tasel.in";
// const SERVER_IP = process.env.SERVER_IP || "98.130.142.128";
// const AUTO_SSL_SCRIPT = process.env.AUTO_SSL_SCRIPT || "/home/ubuntu/auto-ssl.sh";

// // --- Helper Functions ---

// const verifyDns = async (domainToVerify) => {
//   const BASE_DOMAIN = process.env.BASE_DOMAIN || "tasel.in";

//   // Bypass DNS check for development domains
//   if (domainToVerify === "localhost" || domainToVerify === "www.localhost" || domainToVerify.endsWith(".localhost")) {
//     return true;
//   }

//   // Bypass DNS check for subdomains of the platform's base domain
//   // This ensures that subdomains like 'store.tasel.in' are automatically verified
//   if (domainToVerify.endsWith(`.${BASE_DOMAIN}`) || domainToVerify === BASE_DOMAIN) {
//     return true;
//   }
  
//   console.log(`🔍 Verifying DNS for: ${domainToVerify}`);

//   try {
//     // 1. Try resolving CNAME (for subdomains)
//     try {
//       const cnames = await dns.promises.resolve(domainToVerify, "CNAME");
//       // Normalize CNAMEs by removing potential trailing dots (e.g., "shops.tasel.in." -> "shops.tasel.in")
//       const normalizedCnames = cnames.map((c) => c.replace(/\.$/, ""));
      
//       console.log(`   👉 Found CNAMEs: ${normalizedCnames}. Expected: ${CNAME_TARGET}`);
      
//       if (normalizedCnames && normalizedCnames.includes(CNAME_TARGET)) return true;
//     } catch (e) {
//       // Ignore error if CNAME not found, proceed to check A record
//     }

//     // 2. Try resolving A Record (for root domains)
//     const aRecords = await dns.promises.resolve(domainToVerify, "A");
//     console.log(`   👉 Found A Records: ${aRecords}. Expected: ${SERVER_IP}`);
//     return aRecords && aRecords.includes(SERVER_IP);
//   } catch (error) {
//     console.error(`   ❌ DNS Verification Failed: ${error.message}`);
//     // Any DNS resolution error means verification fails
//     return false;
//   }
// };

// /**
//  * @description Triggers the auto-SSL shell script for a verified domain.
//  */
// const runAutoSsl = (domain) => {
//   if (!domain) return;

//   console.log(`🚀 Triggering Auto-SSL for: ${domain}`);
  
//   exec(`${AUTO_SSL_SCRIPT} ${domain}`, (err, stdout, stderr) => {
//     if (err) {
//       console.error(`❌ SSL Error for ${domain}:`, err);
//       return;
//     }
//     if (stderr) {
//       console.warn(`⚠️ SSL Warning for ${domain}:`, stderr);
//     }
//     console.log(`✅ SSL Success for ${domain}:`, stdout);
//   });
// };

// const getDomainStatus = async (hostname) => {
//   // Check the hostname exactly as entered first
//   let isVerified = await verifyDns(hostname);
  
//   // If failed and it's a root domain (no www), try checking www version as fallback
//   if (!isVerified && !hostname.startsWith("www.")) {
//     console.log(`   ⚠️ Direct check failed, trying www.${hostname}...`);
//     isVerified = await verifyDns(`www.${hostname}`);
//   }

//   return isVerified ? "ACTIVE" : "PENDING";
// };

// // --- Controller Functions ---

// /**
//  * @description This endpoint is for Caddy to check if a domain is valid for issuing a certificate.
//  * It is unauthenticated and used for automated SSL.
//  */
// const checkDomain = asyncHandler(async (req, res) => {
//   const { domain } = req.query;
//   if (!domain) {
//     return res
//       .status(400)
//       .json({ message: "Domain query parameter is required." });
//   }

//   const cleanDomain = domain.replace(/^www\./, "").toLowerCase();
//   const BASE_DOMAIN = process.env.BASE_DOMAIN || "tasel.in";

//   // Allow if it matches a valid username subdomain (e.g. username.tasel.in)
//   if (cleanDomain.endsWith(`.${BASE_DOMAIN}`)) {
//     const username = cleanDomain.slice(0, -(`.${BASE_DOMAIN}`.length));
//     const owner = await Owner.findOne({ username });
//     if (owner) return res.status(200).send("OK");
//   }

//   // Find any owner with the domain listed in their storeDomains
//   const owner = await Owner.findOne({ storeDomains: cleanDomain });
//   if (owner) {
//     res.status(200).send("OK");
//   } else {
//     res.status(404).send("Domain not found.");
//   }
// });

// /**
//  * @description Gets all domain-related settings for the owner.
//  * This is the primary endpoint for building the domain management UI.
//  */
// const getDomainSettings = asyncHandler(async (req, res) => {
//   const ownerId = req.user.id;
//   const owner = await Owner.findById(ownerId).select(
//     "primaryDomain storeDomains username"
//   );
//   if (!owner) {
//     throw new ApiError(404, "Owner not found.");
//   }

//   // Get the status of all domains in parallel
//   const domains = await Promise.all(
//     owner.storeDomains.map(async (hostname) => ({
//       hostname,
//       isPrimary: owner.primaryDomain === hostname,
//       status: await getDomainStatus(hostname),
//     }))
//   );

//   // Define the DNS records required for configuration
//   const dnsRecords = [
//     { name: "@", ttl: 3600, type: "A", value: SERVER_IP },
//     { name: "www", ttl: 3600, type: "CNAME", value: CNAME_TARGET },
//   ];

//   const BASE_DOMAIN = process.env.BASE_DOMAIN || "tasel.in";
//   const defaultDomain = `${owner.username}.${BASE_DOMAIN}`;

//   const response = {
//     defaultDomain,
//     dnsRecords,
//     domains,
//   };

//   return res
//     .status(200)
//     .json(
//       new ApiResponse(200, response, "Domain settings retrieved successfully.")
//     );
// });

// /**
//  * @description Adds a new domain to the owner's store.
//  * This endpoint is idempotent.
//  */
// const addDomain = asyncHandler(async (req, res) => {
//   const { hostname } = req.body;
//   const ownerId = req.user.id;

//   if (!hostname || !hostname.trim()) {
//     throw new ApiError(400, "Hostname is required.");
//   }

//   const baseHostname = hostname
//     .replace(/^www\./, "")
//     .toLowerCase()
//     .trim();

//   const owner = await Owner.findById(ownerId);
//   if (!owner) {
//     throw new ApiError(404, "Owner not found.");
//   }

//   // If domain already exists, do nothing and return success.
//   if (!owner.storeDomains.includes(baseHostname)) {
//     owner.storeDomains.push(baseHostname);
//     await owner.save();
//   }

//   return res
//     .status(201)
//     .json(
//       new ApiResponse(
//         201,
//         { hostname: baseHostname },
//         "Domain added successfully."
//       )
//     );
// });

// /**
//  * @description Sets a given domain as the primary domain for the store.
//  * The domain must already be added and verified.
//  */
// const setPrimaryDomain = asyncHandler(async (req, res) => {
//   const { hostname } = req.body;
//   const ownerId = req.user.id;

//   if (!hostname) {
//     throw new ApiError(400, "Hostname is required.");
//   }

//   const owner = await Owner.findById(ownerId);
//   if (!owner) {
//     throw new ApiError(404, "Owner not found.");
//   }

//   // Ensure the domain is one of the owner's domains
//   if (!owner.storeDomains.includes(hostname)) {
//     throw new ApiError(
//       400,
//       "This domain must be added to your store before it can be set as primary."
//     );
//   }

//   // Ensure the domain is verified before making it primary
//   const status = await getDomainStatus(hostname);
//   if (status !== "ACTIVE") {
//     throw new ApiError(
//       400,
//       "Domain must be verified with an ACTIVE status before it can be set as primary."
//     );
//   }

//   owner.primaryDomain = hostname;
//   await owner.save();

//   return res
//     .status(200)
//     .json(
//       new ApiResponse(
//         200,
//         { primaryDomain: hostname },
//         "Primary domain updated successfully."
//       )
//     );
// });

// /**
//  * @description Deletes a domain from the owner's store.
//  */
// const deleteDomain = asyncHandler(async (req, res) => {
//   const { hostname } = req.query;
//   const ownerId = req.user.id;

//   if (!hostname) {
//     throw new ApiError(400, "Hostname query parameter is required.");
//   }

//   const owner = await Owner.findById(ownerId);
//   if (!owner) {
//     throw new ApiError(404, "Owner not found.");
//   }

//   const baseHostname = hostname.toLowerCase().trim();

//   if (!owner.storeDomains.includes(baseHostname)) {
//     return res
//       .status(404)
//       .json(new ApiResponse(404, {}, "Domain not found in your store."));
//   }

//   // Remove the domain
//   owner.storeDomains = owner.storeDomains.filter((d) => d !== baseHostname);

//   // If the deleted domain was the primary one, reset primaryDomain.
//   if (owner.primaryDomain === baseHostname) {
//     owner.primaryDomain = null;
//   }

//   await owner.save();

//   return res
//     .status(200)
//     .json(new ApiResponse(200, {}, "Domain removed successfully."));
// });

// /**
//  * @description Verifies the DNS status of a specific domain.
//  */
// const verifyDomain = asyncHandler(async (req, res) => {
//   const { hostname } = req.body;
  
//   if (!hostname) {
//     throw new ApiError(400, "Hostname is required for verification.");
//   }

//   const status = await getDomainStatus(hostname);

//   if (status === "ACTIVE") {
//     // Trigger SSL generation asynchronously
//     runAutoSsl(hostname);
//   }
  
//   return res.status(200).json(
//     new ApiResponse(
//       200,
//       { hostname, status },
//       `Domain verification completed. Status: ${status}`
//     )
//   );
// });

// /**
//  * @description Manually trigger SSL generation for a domain.
//  * This is useful if the automatic trigger failed or if re-issuance is needed.
//  */
// const triggerSsl = asyncHandler(async (req, res) => {
//   const { hostname } = req.body;

//   if (!hostname) {
//     throw new ApiError(400, "Hostname is required to trigger SSL.");
//   }

//   // Optional: Check if domain is active before triggering?
//   const status = await getDomainStatus(hostname);
//   if (status !== "ACTIVE") {
//     throw new ApiError(400, "Domain must be verified (ACTIVE) before SSL can be issued.");
//   }

//   runAutoSsl(hostname);

//   return res.status(200).json(
//     new ApiResponse(200, { hostname }, "SSL generation triggered successfully.")
//   );
// });

// export {
//   addDomain,
//   checkDomain,
//   deleteDomain,
//   getDomainSettings,
//   setPrimaryDomain,
//   verifyDomain,
//   triggerSsl,
// };



import dns from "dns";
import { exec } from "child_process";
import Owner from "../../model/OwnerModels.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";

// ==========================================
// ENVIRONMENT VARIABLES & CONSTANTS
// ==========================================
const BASE_DOMAIN = process.env.BASE_DOMAIN || "tasel.in";
const CNAME_TARGET = process.env.CNAME_TARGET || "shops.tasel.in";
const SERVER_IP = process.env.SERVER_IP || "18.61.24.122"; // Updated to your AWS EC2 IP
const AUTO_SSL_SCRIPT = process.env.AUTO_SSL_SCRIPT || "/home/ubuntu/auto-ssl.sh";

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Verifies if a domain's DNS records are pointing to this server.
 */
const verifyDns = async (domainToVerify) => {
  // 1. Bypass DNS check for local development environments
  if (domainToVerify === "localhost" || domainToVerify === "www.localhost" || domainToVerify.endsWith(".localhost")) {
    return true;
  }

  // 2. Bypass DNS check for native subdomains (e.g., store.tasel.in)
  if (domainToVerify.endsWith(`.${BASE_DOMAIN}`) || domainToVerify === BASE_DOMAIN) {
    return true;
  }
  
  console.log(`🔍 Verifying DNS for: ${domainToVerify}`);

  try {
    // Check 1: Try resolving CNAME (for subdomains like www.client.com)
    try {
      const cnames = await dns.promises.resolve(domainToVerify, "CNAME");
      const normalizedCnames = cnames.map((c) => c.replace(/\.$/, ""));
      console.log(`   👉 Found CNAMEs: ${normalizedCnames}. Expected: ${CNAME_TARGET}`);
      
      if (normalizedCnames && normalizedCnames.includes(CNAME_TARGET)) return true;
    } catch (e) {
      // Ignore CNAME errors, proceed to check A record
    }

    // Check 2: Try resolving A Record (for root domains like client.com)
    const aRecords = await dns.promises.resolve(domainToVerify, "A");
    console.log(`   👉 Found A Records: ${aRecords}. Expected: ${SERVER_IP}`);
    return aRecords && aRecords.includes(SERVER_IP);

  } catch (error) {
    console.error(`   ❌ DNS Verification Failed: ${error.message}`);
    return false;
  }
};

/**
 * Triggers the bash script to generate a Let's Encrypt SSL certificate.
 */
const runAutoSsl = (domain) => {
  if (!domain) return;

  console.log(`🚀 Triggering Auto-SSL for: ${domain}`);
  
  // NOTE: Ensure the Node.js user (ubuntu/www-data) has permissions to execute this script!
  exec(`${AUTO_SSL_SCRIPT} ${domain}`, (err, stdout, stderr) => {
    if (err) {
      console.error(`❌ SSL Error for ${domain}:`, err.message);
      return;
    }
    if (stderr) {
      // Certbot often outputs standard info to stderr, so we log it as a warning but don't crash
      console.warn(`⚠️ SSL Warning/Info for ${domain}:`, stderr);
    }
    console.log(`✅ SSL Success for ${domain}:\n`, stdout);
  });
};

/**
 * Checks domain status and falls back to 'www.' if the root fails.
 */
const getDomainStatus = async (hostname) => {
  let isVerified = await verifyDns(hostname);
  
  // Fallback: If root domain fails, check if they pointed the 'www' version instead
  if (!isVerified && !hostname.startsWith("www.")) {
    console.log(`   ⚠️ Direct check failed, checking www.${hostname} instead...`);
    isVerified = await verifyDns(`www.${hostname}`);
  }

  return isVerified ? "ACTIVE" : "PENDING";
};

// ==========================================
// CONTROLLER ENDPOINTS
// ==========================================

/**
 * @route GET /api/domains/check
 * @description Internal endpoint (usually for Nginx/Caddy) to verify domain ownership.
 */
const checkDomain = asyncHandler(async (req, res) => {
  const { domain } = req.query;
  
  if (!domain) {
    return res.status(400).json({ message: "Domain query parameter is required." });
  }

  const cleanDomain = domain.replace(/^www\./, "").toLowerCase();

  // 1. Check if it is a native platform subdomain
  if (cleanDomain.endsWith(`.${BASE_DOMAIN}`)) {
    const username = cleanDomain.slice(0, -(`.${BASE_DOMAIN}`.length));
    const owner = await Owner.findOne({ username });
    if (owner) return res.status(200).send("OK");
  }

  // 2. Check if it is a registered custom domain
  const owner = await Owner.findOne({ storeDomains: cleanDomain });
  if (owner) {
    res.status(200).send("OK");
  } else {
    res.status(404).send("Domain not found.");
  }
});

/**
 * @route GET /api/domains/settings
 * @description Retrieves all domain settings and DNS instructions for the dashboard.
 */
const getDomainSettings = asyncHandler(async (req, res) => {
  const ownerId = req.user.id;
  const owner = await Owner.findById(ownerId).select("primaryDomain storeDomains username");
  
  if (!owner) throw new ApiError(404, "Owner not found.");

  // Evaluate the status of all saved domains in parallel
  const domains = await Promise.all(
    owner.storeDomains.map(async (hostname) => ({
      hostname,
      isPrimary: owner.primaryDomain === hostname,
      status: await getDomainStatus(hostname),
    }))
  );

  // Instructions to show the user on the frontend
  const dnsRecords = [
    { name: "@", ttl: 3600, type: "A", value: SERVER_IP },
    { name: "www", ttl: 3600, type: "CNAME", value: CNAME_TARGET },
  ];

  const defaultDomain = `${owner.username}.${BASE_DOMAIN}`;

  return res.status(200).json(
    new ApiResponse(200, { defaultDomain, dnsRecords, domains }, "Domain settings retrieved successfully.")
  );
});

/**
 * @route POST /api/domains/add
 * @description Links a new custom domain to a user's store.
 */
const addDomain = asyncHandler(async (req, res) => {
  const { hostname } = req.body;
  const ownerId = req.user.id;

  if (!hostname || !hostname.trim()) {
    throw new ApiError(400, "Hostname is required.");
  }

  const baseHostname = hostname.replace(/^www\./, "").toLowerCase().trim();
  const owner = await Owner.findById(ownerId);
  
  if (!owner) throw new ApiError(404, "Owner not found.");

  // Idempotency check: only add if it doesn't already exist
  if (!owner.storeDomains.includes(baseHostname)) {
    owner.storeDomains.push(baseHostname);
    await owner.save();
  }

  return res.status(201).json(
    new ApiResponse(201, { hostname: baseHostname }, "Domain added successfully.")
  );
});

/**
 * @route PUT /api/domains/primary
 * @description Sets an active domain as the primary routing domain.
 */
const setPrimaryDomain = asyncHandler(async (req, res) => {
  const { hostname } = req.body;
  const ownerId = req.user.id;

  if (!hostname) throw new ApiError(400, "Hostname is required.");

  const owner = await Owner.findById(ownerId);
  if (!owner) throw new ApiError(404, "Owner not found.");

  if (!owner.storeDomains.includes(hostname)) {
    throw new ApiError(400, "This domain must be added to your store first.");
  }

  const status = await getDomainStatus(hostname);
  if (status !== "ACTIVE") {
    throw new ApiError(400, "Domain must be verified (ACTIVE) before setting as primary.");
  }

  owner.primaryDomain = hostname;
  await owner.save();

  return res.status(200).json(
    new ApiResponse(200, { primaryDomain: hostname }, "Primary domain updated successfully.")
  );
});

/**
 * @route DELETE /api/domains/remove
 * @description Unlinks a domain from a user's store.
 */
const deleteDomain = asyncHandler(async (req, res) => {
  const { hostname } = req.query;
  const ownerId = req.user.id;

  if (!hostname) throw new ApiError(400, "Hostname query parameter is required.");

  const owner = await Owner.findById(ownerId);
  if (!owner) throw new ApiError(404, "Owner not found.");

  const baseHostname = hostname.toLowerCase().trim();

  if (!owner.storeDomains.includes(baseHostname)) {
    return res.status(404).json(new ApiResponse(404, {}, "Domain not found in your store."));
  }

  owner.storeDomains = owner.storeDomains.filter((d) => d !== baseHostname);

  // Clear primary domain if the deleted domain was the primary one
  if (owner.primaryDomain === baseHostname) {
    owner.primaryDomain = null;
  }

  await owner.save();

  return res.status(200).json(new ApiResponse(200, {}, "Domain removed successfully."));
});

/**
 * @route POST /api/domains/verify
 * @description Manual trigger to check DNS status and issue SSL if valid.
 */
const verifyDomain = asyncHandler(async (req, res) => {
  const { hostname } = req.body;
  
  if (!hostname) throw new ApiError(400, "Hostname is required for verification.");

  const status = await getDomainStatus(hostname);

  if (status === "ACTIVE") {
    runAutoSsl(hostname); // Trigger SSL generation in the background
  }
  
  return res.status(200).json(
    new ApiResponse(200, { hostname, status }, `Domain verification completed. Status: ${status}`)
  );
});

/**
 * @route POST /api/domains/ssl
 * @description Force-trigger the SSL bash script (Useful for renewals/retries).
 */
const triggerSsl = asyncHandler(async (req, res) => {
  const { hostname } = req.body;

  if (!hostname) throw new ApiError(400, "Hostname is required to trigger SSL.");

  const status = await getDomainStatus(hostname);
  if (status !== "ACTIVE") {
    throw new ApiError(400, "Domain must be verified (ACTIVE) before SSL can be issued.");
  }

  runAutoSsl(hostname);

  return res.status(200).json(
    new ApiResponse(200, { hostname }, "SSL generation triggered successfully.")
  );
});

export {
  addDomain,
  checkDomain,
  deleteDomain,
  getDomainSettings,
  setPrimaryDomain,
  verifyDomain,
  triggerSsl,
};