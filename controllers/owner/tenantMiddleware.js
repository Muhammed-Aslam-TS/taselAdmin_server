/* eslint-disable no-undef */
import Owner from "../../model/OwnerModels.js";

let cachedDefaultOwner = null;

export const tenantMiddleware = async (req, res, next) => {
  try {
    const host = req.query?.domain || req.get("host"); // Allow query param override (e.g. ?domain=localhost)
    let hostname = host?.split(":")[0];
    if (hostname) hostname = hostname.replace(/^www\./, "").toLowerCase();

    if (!hostname) {
      return res.status(400).json({ message: "Invalid Host header" });
    }

    // 1. Try to find the owner in DB
    // We try looking up localhost too, in case the user registered it
    let owner = await Owner.findByHost(hostname);

    if (owner) {
      req.owner = owner;
      res.locals.owner = owner;
      return next();
    }

    // 2. If NO owner found, check if it's a allowed "Platform" domain
    const BASE_DOMAIN = process.env.BASE_DOMAIN || "tasel.in";
    const SERVER_IP = process.env.SERVER_IP || "98.130.142.128";
    
    // Check if it's a platform domain (Allow localhost, 127.x.x.x, and 192.168.x.x)
    const isLocalIp = hostname.startsWith('127.') || hostname.startsWith('192.168.');
    if (hostname === BASE_DOMAIN || hostname === SERVER_IP || hostname === 'localhost' || isLocalIp) {
       // [DEV FALLBACK] If localhost or local network IP, try to find a default owner to allow Public APIs to work
       // This fixes "No ownerId found" errors during local development when hostname isn't in DB
       if (hostname === 'localhost' || isLocalIp) {
           if (!cachedDefaultOwner) {
               cachedDefaultOwner = await Owner.findOne().sort({ createdAt: 1 });
           }
           
           if (cachedDefaultOwner) {
               req.owner = cachedDefaultOwner;
               res.locals.owner = cachedDefaultOwner;
           }
       }
       return next();
    }

    // 3. If clearly not a known store and not the platform -> 404
    return res.status(404).json({ message: "Store not found" });

  } catch (error) {
    console.error("Tenant identification error:", error);
    res.status(500).json({ message: "Internal server error during tenant resolution" });
  }
};