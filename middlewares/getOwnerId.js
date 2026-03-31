export const getOwnerId = (req) => {
    // 1. Prefer authenticated owner context
    if (req.user?.userType === 'owner' && req.user.id) return req.user.id;
    // 2. Prefer ownerId from authenticated user
    if (req.ownerId) return req.ownerId;
    if (req.user?.ownerId) return req.user.ownerId;
    // 3. Fallback to domain-resolved owner
    if (req.owner?._id) return req.owner._id;
    return null;
};