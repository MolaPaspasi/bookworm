import Order from "../models/Order.js";
import { generateHashedCode } from "../utils/rotatingCode.js";

export const startCodeRotation = () => {
  console.log("🔁 Code rotation service started (every 10s)");

  setInterval(async () => {
    try {
      const activeOrders = await Order.find({
        status: { $in: ["pending", "confirmed"] },
      });

      for (const order of activeOrders) {
        const { plain, hash } = await generateHashedCode();
        order.pickupCodeHash = hash;
        order.codeGeneratedAt = new Date();
        await order.save();

        // burada plain kodu sadece logluyoruz (production'da loglama kaldırılabilir)
        console.log(`🧾 New code for order ${order._id}: ${plain}`);
      }
    } catch (err) {
      console.error("Code rotation error:", err.message);
    }
  }, 20000);
};
