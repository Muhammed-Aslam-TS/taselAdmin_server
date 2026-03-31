// import { createOrder, verifyPayment } from "../../middlewares/razorpay.js";
// import Order from "../../model/orderModel.js";
// import User from "../../model/usersModel.js";

// // Create payment order
// export const createPaymentOrder = async (req, res) => {
//   try {
//     const userId = req.user.id;

//     const { address, amount, items, estimatedDelivery, paymentMethod,currency = "INR" } = req.body;
    
//     const razorpayOrder = await createOrder(amount, currency);
// // console.log(razorpayOrder,":-----------------razorpayOrder");

//     // Save order details in your database
//     if (razorpayOrder) {
//       const newOrder = new Order({
//         userId: userId,
//         amount: amount, // in rupees
//         currency: currency,
//         shippingAddress: address,
//         items,
//         estimatedDelivery,
//         razorpayOrderId: razorpayOrder.id,
//         paymentStatus: 'PENDING',
//         subtotal: amount, // For now, use amount as subtotal
//         gstAmount: 0, // Set to 0 or calculate as needed
//         totalAmount: amount, // For now, use amount as total
//         paymentMethod: "RAZORPAY", // Set to 'RAZORPAY' for Razorpay
//         // Add other fields as needed (e.g., cart, address, etc.)
//       });
//       const savedOrder = await newOrder.save();

//       console.log(savedOrder,"---------------savedOrder");
      
//       res.status(200).json({
//         success: true,
//         data: {
//           orderId: razorpayOrder.id,
//           amount: razorpayOrder.amount,
//           currency: razorpayOrder.currency,
//           key: process.env.RAZORPAY_KEY_ID,
//           mongoOrderId: savedOrder._id,
//         },
//       });
//     }
//   } catch (error) {
//     console.error("Error creating payment order:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error creating payment order",
//       error: error.message,
//     });
//   }
// };

// // Verify and process payment
// export const verifyAndProcessPayment = async (req, res) => {
//   try {
//     console.log("Payment verification request body:", req.body);

//     const razorpay_order_id  = req.body.orderId
//     const razorpay_payment_id = req.body.paymentId
//     const razorpay_signature = req.body.signature

//     // Verify payment signature
//     const isValid = verifyPayment(
//       razorpay_order_id,
//       razorpay_payment_id,
//       razorpay_signature
//     );

//     if (!isValid) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid payment signature",
//       });
//     }

//     // Find and update order by Razorpay order ID
//     const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found",
//       });
//     }

//     // Update order status
//     order.paymentStatus = "COMPLETED";
//     order.paymentDetails = {
//       razorpay_order_id,
//       razorpay_payment_id,
//       razorpay_signature,
//     };
//     await order.save();

//     res.status(200).json({
//       success: true,
//       message: "Payment verified and processed successfully",
//       data: {
//         orderId: order._id,
//         paymentStatus: order.paymentStatus,
//       },
//     });
//   } catch (error) {
//     console.error("Error verifying payment:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error verifying payment",
//       error: error.message,
//     });
//   }
// };

// // Get payment status
// export const getPaymentStatus = async (req, res) => {
//   try {
//     const { orderId } = req.params;
//     const userId = req.user.id;

//     const order = await Order.findOne({
//       _id: orderId,
//       userId: userId,
//     });

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found",
//       });
//     }

//     res.status(200).json({
//       success: true,
//       data: {
//         orderId: order._id,
//         paymentStatus: order.paymentStatus,
//         paymentDetails: order.paymentDetails,
//       },
//     });
//   } catch (error) {
//     console.error("Error getting payment status:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error getting payment status",
//       error: error.message,
//     });
//   }
// };
