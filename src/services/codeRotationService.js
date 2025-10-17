import Order from "../models/Order.js";
import { generateHashedCode } from "../utils/rotatingCode.js";

export const startCodeRotation = () => {
  console.log("🔁 Code rotation service started (every 20s)");

  setInterval(async () => {
    try {
      const activeOrders = await Order.find({
        status: { $in: ["pending", "confirmed"] },
      });

      for (const order of activeOrders) {
        // Only generate new code if no code exists or if the current code is expired
        const hasExpiredCode = order.codeGeneratedAt && 
          (Date.now() - new Date(order.codeGeneratedAt).getTime() > 20000);
        
        if (!order.pickupCodeHash || hasExpiredCode) {
          const { plain, hash } = await generateHashedCode();
          order.pickupCodeHash = hash;
          order.pickupCodePlain = plain; // Store plain text for customer display
          order.codeGeneratedAt = new Date();
          await order.save();

          console.log(`🧾 New code for order ${order._id}: ${plain}`);
        } else {
          console.log(`⏰ Code for order ${order._id} still valid, skipping rotation`);
        }
      }
    } catch (err) {
      console.error("Code rotation error:", err.message);
    }
  }, 20000);
};
