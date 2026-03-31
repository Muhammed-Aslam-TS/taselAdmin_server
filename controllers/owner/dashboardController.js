import Order from '../../model/orderModel.js';
import Product from '../../model/product.js';
import User from '../../model/usersModel.js';
import mongoose from 'mongoose';

const getOwnerProductIds = async (ownerId) => {
    const products = await Product.find({ ownerId: new mongoose.Types.ObjectId(ownerId) }).select('_id');
    return products.map(p => p._id);
};

export const getDashboardStats = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const ownerProductIds = await getOwnerProductIds(ownerId);

        // If owner has no products, there can be no stats.
        if (ownerProductIds.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    kpiData: {
                        totalRevenue: { value: 0, change: 0 },
                        totalOrders: { value: 0, change: 0 },
                        totalCustomers: { value: 0, change: 0 },
                        avgOrderValue: { value: 0, change: 0 },
                    },
                    recentOrders: [],
                    monthlySalesData: [],
                    categorySalesData: [],
                    topSellingProducts: [],
                }
            });
        }

        // --- 1. Order Stats (KPIs) Logic ---
        const now = new Date();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        // This function calculates metrics based only on the owner's items in orders.
        const getKpiMetrics = async (startDate, endDate) => {
            const result = await Order.aggregate([
                { $match: { 'items.productId': { $in: ownerProductIds }, createdAt: { $gte: startDate, $lt: endDate } } },
                { $unwind: '$items' },
                { $match: { 'items.productId': { $in: ownerProductIds } } },
                { $group: {
                    _id: '$_id', // Group by order ID first
                    ownerRevenueForOrder: { $sum: '$items.price' },
                    userId: { $first: '$userId' }
                }},
                { $group: {
                    _id: null,
                    totalRevenue: { $sum: '$ownerRevenueForOrder' },
                    totalOrders: { $sum: 1 }, // This counts distinct orders the owner participated in
                    uniqueCustomers: { $addToSet: '$userId' }
                }}
            ]);

            if (result.length === 0) {
                return { totalRevenue: 0, totalOrders: 0, totalCustomers: 0, avgOrderValue: 0 };
            }
            const { totalRevenue, totalOrders, uniqueCustomers } = result[0];
            const validCustomers = uniqueCustomers.filter(c => c !== null);
            return {
                totalRevenue,
                totalOrders,
                totalCustomers: validCustomers.length,
                avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
            };
        };

        // --- 2. Recent Orders Logic ---
        const recentOrdersPromise = Order.find({ 'items.productId': { $in: ownerProductIds } })
            .populate({ path: 'userId', select: 'username' })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        // --- 3. Order Overview Logic ---
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const monthlySalesDataPromise = Order.aggregate([
            { $match: { 'items.productId': { $in: ownerProductIds }, createdAt: { $gte: sixMonthsAgo } } },
            { $unwind: '$items' },
            { $match: { 'items.productId': { $in: ownerProductIds } } },
            { $group: {
                _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
                revenue: { $sum: '$items.price' },
                ordersSet: { $addToSet: '$_id' }
            }},
            { $project: {
                _id: 1,
                revenue: 1,
                orders: { $size: '$ordersSet' }
            }},
            { $sort: { '_id.year': 1, '_id.month': 1 } },
            { $project: {
                _id: 0,
                name: { $let: { vars: { months: [null, 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] }, in: { $arrayElemAt: ['$$months', '$_id.month'] } } },
                revenue: '$revenue',
                orders: '$orders',
            }}
        ]);

        // --- 4. Usage Trends Logic (Category Sales) ---
        const categorySalesDataPromise = Order.aggregate([
            { $match: { 'items.productId': { $in: ownerProductIds } } },
            { $unwind: '$items' },
            { $match: { 'items.productId': { $in: ownerProductIds } } },
            { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'productDetails' }},
            { $unwind: '$productDetails' },
            { $lookup: { from: 'categories', localField: 'productDetails.category', foreignField: '_id', as: 'categoryDetails' }},
            { $unwind: '$categoryDetails' },
            { $group: {
                _id: '$categoryDetails.categoryName',
                value: { $sum: '$items.price' }
            }},
            { $project: { _id: 0, name: { $ifNull: ['$_id', 'Uncategorized'] }, value: '$value' } },
            { $sort: { value: -1 } },
            { $limit: 5 }
        ]);

        // --- 5. Top Selling Products ---
        const topSellingProductsPromise = Order.aggregate([
            { $match: { 'items.productId': { $in: ownerProductIds } } },
            { $unwind: '$items' },
            { $match: { 'items.productId': { $in: ownerProductIds } } },
            {
                $group: {
                    _id: '$items.productId',
                    totalQuantitySold: { $sum: '$items.quantity' },
                }
            },
            { $sort: { totalQuantitySold: -1 } },
            { $limit: 5 },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            { $unwind: '$productDetails' },
            {
                $project: {
                    _id: 0,
                    name: '$productDetails.title',
                    images: '$productDetails.images',
                    sales: '$totalQuantitySold'
                }
            }
        ]);

        // --- 6. Order Status Distribution ---
        const orderStatusDataPromise = Order.aggregate([
            { $match: { 'items.productId': { $in: ownerProductIds } } },
            { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
            { $project: { name: '$_id', value: '$count', _id: 0 } }
        ]);

        // --- 7. Inventory Health ---
        const inventoryDataPromise = Product.aggregate([
            { $match: { ownerId: new mongoose.Types.ObjectId(ownerId) } },
            { $project: {
                title: 1,
                productType: 1,
                baseStock: 1,
                variants: 1,
                stock: { $cond: { if: { $eq: ['$productType', 'simple'] }, then: '$baseStock', else: { $sum: '$variants.stockQuantity' } } }
            }},
            { $group: {
                _id: null,
                outOfStock: { $sum: { $cond: [{ $lte: ['$stock', 0] }, 1, 0] } },
                lowStock: { $sum: { $cond: [{ $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', 10] }] }, 1, 0] } },
                inStock: { $sum: { $cond: [{ $gt: ['$stock', 10] }, 1, 0] } },
                lowStockProducts: { $push: { $cond: [{ $lte: ['$stock', 10] }, { name: '$title', stock: '$stock' }, null] } }
            }},
            { $project: { 
                _id: 0, 
                summary: [
                    { name: 'Out of Stock', value: '$outOfStock' },
                    { name: 'Low Stock', value: '$lowStock' },
                    { name: 'In Stock', value: '$inStock' }
                ],
                lowStockProducts: { 
                    $filter: {
                        input: '$lowStockProducts',
                        as: 'p',
                        cond: { $ne: ['$$p', null] }
                    }
                }
            }},
            { $project: {
                summary: 1,
                lowStockProducts: { $slice: ['$lowStockProducts', 5] }
            }}
        ]);

        // --- 8. Customer Metrics ---
        const customerMetricsPromise = Order.aggregate([
            { $match: { 'items.productId': { $in: ownerProductIds } } },
            { $group: { _id: '$userId', orderCount: { $sum: 1 } } },
            { $group: {
                _id: null,
                repeat: { $sum: { $cond: [{ $gt: ['$orderCount', 1] }, 1, 0] } },
                new: { $sum: { $cond: [{ $eq: ['$orderCount', 1] }, 1, 0] } }
            }},
            { $project: { _id: 0, data: [{ name: 'Repeat Customer', value: '$repeat' }, { name: 'New Customer', value: '$new' }] } }
        ]);

        // --- 9. Geographic Data ---
        const geographicDataPromise = Order.aggregate([
            { $match: { 'items.productId': { $in: ownerProductIds } } },
            { $unwind: '$items' },
            { $match: { 'items.productId': { $in: ownerProductIds } } },
            { $group: { 
                _id: { zipCode: '$shippingAddress.zipCode', city: '$shippingAddress.city' }, 
                value: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } 
            }},
            { $sort: { value: -1 } },
            { $limit: 5 },
            { $project: { name: '$_id.zipCode', city: '$_id.city', value: 1, _id: 0 } }
        ]);

        // --- 10. Payment Data ---
        const paymentDataPromise = Order.aggregate([
            { $match: { 'items.productId': { $in: ownerProductIds } } },
            { $group: { _id: '$paymentMethod', value: { $sum: 1 } } },
            { $project: { name: '$_id', value: 1, _id: 0 } }
        ]);

        const [
            thisMonthMetrics, lastMonthMetrics, recentOrdersRaw, monthlySalesData, 
            categorySalesData, topSellingProducts, orderStatusData, 
            inventoryDataRaw, customerMetricsRaw, geographicData, paymentData
        ] = await Promise.all([
            getKpiMetrics(startOfThisMonth, now),
            getKpiMetrics(startOfLastMonth, startOfThisMonth),
            recentOrdersPromise,
            monthlySalesDataPromise,
            categorySalesDataPromise,
            topSellingProductsPromise,
            orderStatusDataPromise,
            inventoryDataPromise,
            customerMetricsPromise,
            geographicDataPromise,
            paymentDataPromise
        ]);

        const inventoryData = inventoryDataRaw[0] || { summary: [], lowStockProducts: [] };
        const customerMetrics = customerMetricsRaw[0]?.data || [];
        
        // Post-process recent orders to show owner-specific totals
        const recentOrders = recentOrdersRaw.map(order => {
            const ownerItems = (order.items || []).filter(item => item.productId && ownerProductIds.some(id => id.equals(item.productId)));
            const ownerTotalForOrder = ownerItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);
            return {
                ...order,
                totalAmount: ownerTotalForOrder, // Overwrite totalAmount with owner-specific total
                items: ownerItems, // Only include owner's items in the returned order
                user: order.userId,
            };
        });

        const calculateChange = (current, previous) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return ((current - previous) / previous) * 100;
        };

        const kpiData = {
            totalRevenue: { value: thisMonthMetrics.totalRevenue, change: calculateChange(thisMonthMetrics.totalRevenue, lastMonthMetrics.totalRevenue) },
            totalOrders: { value: thisMonthMetrics.totalOrders, change: calculateChange(thisMonthMetrics.totalOrders, lastMonthMetrics.totalOrders) },
            totalCustomers: { value: thisMonthMetrics.totalCustomers, change: calculateChange(thisMonthMetrics.totalCustomers, lastMonthMetrics.totalCustomers) },
            avgOrderValue: { value: thisMonthMetrics.avgOrderValue, change: calculateChange(thisMonthMetrics.avgOrderValue, lastMonthMetrics.avgOrderValue) },
        };

        // Injecting advanced analytics payload - derived ONLY from real data without random multipliers
        const deviceData = [
          { name: "Order-Linked", value: thisMonthMetrics.totalOrders, color: "#0ea5e9", change: null, type: "neutral" },
        ];

        // Maps real geographic data to the location format expected by the frontend
        let locationData = geographicData.map((geo, i) => ({
          name: `India · ${geo.city || 'Unknown'} · ${geo.name || 'Unknown'}`,
          current: geo.value, 
          previous: 0,
          currentStr: geo.value > 1000 ? (geo.value/1000).toFixed(1) + 'K' : geo.value.toString(),
          change: "0%", 
          type: "neutral", 
          max: geographicData[0]?.value || 1000 
        }));

        const socialData = [
          { name: "Direct Sales", current: thisMonthMetrics.totalRevenue, previous: lastMonthMetrics.totalRevenue, currentText: "₹" + (thisMonthMetrics.totalRevenue / 1000).toFixed(1) + "K", previousText: "₹" + (lastMonthMetrics.totalRevenue / 1000).toFixed(1) + "K", change: calculateChange(thisMonthMetrics.totalRevenue, lastMonthMetrics.totalRevenue).toFixed(0) + "%", type: "up", max: thisMonthMetrics.totalRevenue || 10000 },
        ];

        const landingPageData = [
          { name: "All Store Pages", sessions: thisMonthMetrics.totalOrders.toString(), change: "0%", type: "neutral" },
        ];

        const liveViewData = {
          visitorsRightNow: 0, // No real-time tracker currently installed
          totalSales: thisMonthMetrics.totalRevenue,
          sessionsCount: thisMonthMetrics.totalOrders, // Using orders as a proxy for successful sessions
          ordersCount: thisMonthMetrics.totalOrders,
          activeCarts: 0,
          checkingOut: 0,
          purchased: thisMonthMetrics.totalOrders,
        };

        const sessionsGraphData = monthlySalesData.slice(-10).map(m => ({
           day: m.name,
           current: m.orders,
           previous: 0
        }));

        const conversionGraphData = monthlySalesData.slice(-10).map(m => ({
           day: m.name,
           current: 100, // Placeholder as session tracking is not active
           previous: 0
        }));

        const baseOrders = thisMonthMetrics.totalOrders;
        
        const conversionFunnelData = {
          sessions: { value: baseOrders, change: "0%", rate: "100%" },
          addedToCart: { value: baseOrders, change: "0%", rate: "100%" },
          reachedCheckout: { value: baseOrders, change: "0%", rate: "100%" },
          completedOrder: { value: baseOrders, change: "0%", rate: "100%" }
        };

        const responseData = {
            success: true,
            data: { 
                kpiData, recentOrders, monthlySalesData, categorySalesData, topSellingProducts,
                orderStatusData, inventoryData, customerMetrics, geographicData, paymentData,
                deviceData, locationData, socialData, landingPageData, liveViewData,
                sessionsGraphData, conversionGraphData, conversionFunnelData
            }
        };

        res.status(200).json(responseData);

    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        res.status(500).json({ success: false, message: 'Error fetching dashboard stats.', error: error.message });
    }
};

// The following functions are kept for individual route compatibility, but are now refactored to use the accurate, prorated logic.

export const getOrderStats = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const ownerProductIds = await getOwnerProductIds(ownerId);
    
    if (ownerProductIds.length === 0) {
      return res.status(200).json({ success: true, data: {
        totalRevenue: { value: 0, change: 0 }, totalOrders: { value: 0, change: 0 },
        totalCustomers: { value: 0, change: 0 }, avgOrderValue: { value: 0, change: 0 },
      }});
    }

    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const getKpiMetrics = async (startDate, endDate) => {
      const result = await Order.aggregate([
        { $match: { 'items.productId': { $in: ownerProductIds }, createdAt: { $gte: startDate, $lt: endDate } } },
        { $unwind: '$items' }, { $match: { 'items.productId': { $in: ownerProductIds } } },
        { $group: { _id: '$_id', ownerRevenueForOrder: { $sum: '$items.price' }, userId: { $first: '$userId' } }},
        { $group: { _id: null, totalRevenue: { $sum: '$ownerRevenueForOrder' }, totalOrders: { $sum: 1 }, uniqueCustomers: { $addToSet: '$userId' }}}
      ]);
      if (result.length === 0) return { totalRevenue: 0, totalOrders: 0, totalCustomers: 0, avgOrderValue: 0 };
      const { totalRevenue, totalOrders, uniqueCustomers } = result[0];
      const validCustomers = uniqueCustomers.filter(c => c !== null);
      return {
          totalRevenue, totalOrders, totalCustomers: validCustomers.length,
          avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      };
    };

    const thisMonthMetrics = await getKpiMetrics(startOfThisMonth, now);
    const lastMonthMetrics = await getKpiMetrics(startOfLastMonth, startOfThisMonth);

    const calculateChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const kpiData = {
      totalRevenue: { value: thisMonthMetrics.totalRevenue, change: calculateChange(thisMonthMetrics.totalRevenue, lastMonthMetrics.totalRevenue) },
      totalOrders: { value: thisMonthMetrics.totalOrders, change: calculateChange(thisMonthMetrics.totalOrders, lastMonthMetrics.totalOrders) },
      totalCustomers: { value: thisMonthMetrics.totalCustomers, change: calculateChange(thisMonthMetrics.totalCustomers, lastMonthMetrics.totalCustomers) },
      avgOrderValue: { value: thisMonthMetrics.avgOrderValue, change: calculateChange(thisMonthMetrics.avgOrderValue, lastMonthMetrics.avgOrderValue) },
    };

    res.status(200).json({ success: true, data: kpiData });
  } catch (error) {
    console.error("Error fetching order stats:", error);
    res.status(500).json({ success: false, message: 'Error fetching order stats.', error: error.message });
  }
};

export const getRecentOrders = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const ownerProductIds = await getOwnerProductIds(ownerId);
    
    if (ownerProductIds.length === 0) return res.status(200).json({ success: true, data: [] });

    const recentOrdersRaw = await Order.find({ 'items.productId': { $in: ownerProductIds } })
      .populate({ path: 'userId', select: 'username' }).sort({ createdAt: -1 }).limit(5).lean();
    
    const recentOrders = recentOrdersRaw.map(order => {
        const ownerItems = order.items.filter(item => ownerProductIds.some(id => id.equals(item.productId)));
        const ownerTotalForOrder = ownerItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        return { ...order, totalAmount: ownerTotalForOrder, items: ownerItems, user: order.userId };
    });

    res.status(200).json({ success: true, data: recentOrders });
  } catch (error) {
    console.error("Error fetching recent orders:", error);
    res.status(500).json({ success: false, message: 'Error fetching recent orders.', error: error.message });
  }
};

export const getOrderOverview = async (req,res) => {
  try {
    const ownerId = req.user.id;
    const ownerProductIds = await getOwnerProductIds(ownerId);
    
    if (ownerProductIds.length === 0) return res.status(200).json({ success: true, data: [] });

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlySalesData = await Order.aggregate([
        { $match: { 'items.productId': { $in: ownerProductIds }, createdAt: { $gte: sixMonthsAgo } } },
        { $unwind: '$items' }, { $match: { 'items.productId': { $in: ownerProductIds } } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, revenue: { $sum: '$items.price' }, ordersSet: { $addToSet: '$_id' }}},
        { $project: { _id: 1, revenue: 1, orders: { $size: '$ordersSet' }}},
        { $sort: { '_id.year': 1, '_id.month': 1 } },
        { $project: { _id: 0, name: { $let: { vars: { months: [null, 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] }, in: { $arrayElemAt: ['$$months', '$_id.month'] } } }, revenue: '$revenue', orders: '$orders' }}
    ]);

    res.status(200).json({ success: true, data: monthlySalesData });
  } catch (error) {
    console.error("Error fetching order overview:", error);
    res.status(500).json({ success: false, message: 'Error fetching order overview.', error: error.message });
  }
};

export const getUsageTrends = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const ownerProductIds = await getOwnerProductIds(ownerId);

    if (ownerProductIds.length === 0) return res.status(200).json({ success: true, data: [] });
    
    const categorySalesData = await Order.aggregate([
        { $match: { 'items.productId': { $in: ownerProductIds } } },
        { $unwind: '$items' }, { $match: { 'items.productId': { $in: ownerProductIds } } },
        { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'productDetails' }},
        { $unwind: '$productDetails' },
        { $lookup: { from: 'categories', localField: 'productDetails.category', foreignField: '_id', as: 'categoryDetails' }},
        { $unwind: '$categoryDetails' },
        { $group: { _id: '$categoryDetails.categoryName', value: { $sum: '$items.price' }}},
        { $project: { _id: 0, name: { $ifNull: ['$_id', 'Uncategorized'] }, value: '$value' } },
        { $sort: { value: -1 } }, { $limit: 5 }
    ]);

    res.status(200).json({ success: true, data: categorySalesData });
  } catch (error) {
    console.error("Error fetching usage trends:", error);
    res.status(500).json({ success: false, message: 'Error fetching usage trends.', error: error.message });
  }
};

export const getTopSellingProducts = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const ownerProductIds = await getOwnerProductIds(ownerId);

        if (ownerProductIds.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        const topSellingProducts = await Order.aggregate([
            { $match: { 'items.productId': { $in: ownerProductIds } } },
            { $unwind: '$items' },
            { $match: { 'items.productId': { $in: ownerProductIds } } },
            { $group: {
                _id: '$items.productId',
                totalQuantitySold: { $sum: '$items.quantity' }
            }},
            { $sort: { totalQuantitySold: -1 } },
            { $limit: 5 },
            { $lookup: {
                from: 'products',
                localField: '_id',
                foreignField: '_id',
                as: 'productDetails'
            }},
            { $unwind: '$productDetails' },
            { $project: {
                _id: 0,
                name: '$productDetails.title',
                images: '$productDetails.images',
                sales: '$totalQuantitySold'
            }}
        ]);

        res.status(200).json({ success: true, data: topSellingProducts });
    } catch (error) {
        console.error("Error fetching top selling products:", error);
        res.status(500).json({ success: false, message: 'Error fetching top selling products.', error: error.message });
    }
};