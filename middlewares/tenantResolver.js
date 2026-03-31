import Owner from "../model/OwnerModels.js";

// export const tenantResolver = async (req, res, next) => {
//   const hostname = req.hostname;
//   const domainToResolve = req.query.domain || hostname;

//   // 1. Check if it's the Super Admin domain (Added localhost for development)
//   const superAdminDomains = ['tasel.in', 'www.tasel.in', 'localhost', '127.0.0.1'];
  
//   // Only treat as super admin if it's a super admin domain AND no specific domain query is provided
//   if (superAdminDomains.includes(hostname) && !req.query.domain) {
//     req.isSuperAdmin = true;
//     return next();
//   }

//   // 2. Otherwise, treat it as an Owner's custom domain
//   try {
//     const owner = await Owner.findOne({
//       $or: [
//         { primaryDomain: domainToResolve },
//         { storeDomains: domainToResolve } // Works if storeDomains is an array or string
//       ]
//     }).lean();

//     if (owner) {
//       req.owner = owner;
//     }
    
//     next();
//   } catch (error) {
//     console.error("Tenant resolution error:", error);
//     // Pass error to global error handler or continue
//     next(error);
//   }
// }



export const tenantResolver = async (req, res, next) => {
  const hostname = req.hostname.toLowerCase(); // 1. Case insensitive
  const domainToResolve = (req.query.domain || hostname).toLowerCase();

  const superAdminDomains = ['tasel.in', 'www.tasel.in', 'localhost', '127.0.0.1'];
  
  if (superAdminDomains.includes(hostname)) {
    // 2. Extra check: Don't allow owners to override super admin via query
    if (!req.query.domain || superAdminDomains.includes(domainToResolve)) {
      req.isSuperAdmin = true;
      return next();
    }
  }

  try {
    const owner = await Owner.findOne({
      $or: [
        { primaryDomain: domainToResolve },
        { storeDomains: domainToResolve } 
      ]
    }).lean();

    if (owner) {
      req.owner = owner;
      next();
    } else {
      // 3. Handle cases where the domain doesn't exist in your DB
      res.status(404).send("Store not found");
    }
  } catch (error) {
    console.error("Tenant resolution error:", error);
    next(error);
  }
}