import express from "express";
import protectRoute from "../middleware/auth.middleware.js";
import Order from "../models/Order.js";
import { generateHashedCode, isValidCode } from "../utils/rotatingCode.js";

const router = express.Router();
const HISTORY_STATUSES = ["picked", "completed"];

/* =========================================================================
   🧾 CREATE ORDER (CUSTOMER)
   ========================================================================= */
router.post("/", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Only customers can create orders" });
    }

    const { company, items, totalAmount } = req.body;
    if (!company || !items || !totalAmount) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // 10 saniyelik ilk kodu oluştur
    const { plain, hash } = await generateHashedCode();

    const order = await Order.create({
      customer: req.user._id,
      company,
      items,
      totalAmount,
      pickupCodeHash: hash,
      codeGeneratedAt: new Date(),
      status: "confirmed",
    });

    res.status(201).json({
      message: "Order created successfully",
      orderId: order._id,
      pickupCode: plain, // sadece backend tarafında görülebilir
      createdAt: order.createdAt,
    });
  } catch (err) {
    console.error("Order creation error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   👤 GET MY ORDERS (CUSTOMER)
   ========================================================================= */
router.get("/my", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Only customers can view their orders" });
    }

    const orders = await Order.find({ customer: req.user._id })
      .populate("company", "companyName username")
      .populate("items.package", "name price");

    res.json(orders);
  } catch (err) {
    console.error("Fetch my orders error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/my/history", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Only customers can view their history" });
    }

    const orders = await Order.find({
      customer: req.user._id,
      status: { $in: HISTORY_STATUSES },
    })
      .sort({ createdAt: -1 })
      .populate("company", "companyName username email")
      .populate("items.package", "name price");

    res.json(orders);
  } catch (err) {
    console.error("Fetch customer history error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   🏢 GET COMPANY ORDERS
   ========================================================================= */
router.get("/company", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can view orders" });
    }

    const orders = await Order.find({ company: req.user._id })
      .populate("customer", "username email")
      .populate("items.package", "name price");

    res.json(orders);
  } catch (err) {
    console.error("Fetch company orders error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/company/history", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can view their history" });
    }

    const orders = await Order.find({
      company: req.user._id,
      status: { $in: HISTORY_STATUSES },
    })
      .sort({ createdAt: -1 })
      .populate("customer", "username email")
      .populate("items.package", "name price");

    res.json(orders);
  } catch (err) {
    console.error("Fetch company history error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   🔄 REFRESH CODE (OPTIONAL)
   Şirket tarafı dilerse manuel olarak yeni kod oluşturabilir.
   ========================================================================= */
router.post("/:id/refresh-code", protectRoute, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (req.user.role !== "company" || String(req.user._id) !== String(order.company)) {
      return res.status(403).json({ message: "Not authorized to refresh this code" });
    }

    const { plain, hash } = await generateHashedCode();
    order.pickupCodeHash = hash;
    order.codeGeneratedAt = new Date();
    await order.save();

    res.json({
      message: "Code refreshed successfully",
      newCode: plain,
    });
  } catch (err) {
    console.error("Code refresh error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});
/* =========================================================================
   🕓 GET COMPANY PICKED ORDERS (HISTORY)
   ========================================================================= */
router.get("/company/history", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can view history" });
    }

    const orders = await Order.find({
      company: req.user._id,
      status: "picked", // ✅ sadece teslim edilmiş (picked) siparişleri getir
    })
      .populate("customer", "username email")
      .populate("items.package", "name price")
      .sort({ createdAt: -1 }); // son sipariş en üstte

    res.json(orders);
  } catch (err) {
    console.error("Fetch company picked orders error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});


/* =========================================================================
   ✅ VERIFY CODE (COMPANY ONLY)
   ========================================================================= */
router.post("/:id/verify-code", protectRoute, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (req.user.role !== "company" || String(req.user._id) !== String(order.company)) {
      return res.status(403).json({ message: "Not authorized to verify this order" });
    }

    const { code } = req.body;
    if (!code) return res.status(400).json({ message: "Code required" });

    const expired = Date.now() - new Date(order.codeGeneratedAt).getTime() > 20000;
    if (expired) return res.status(400).json({ message: "Code expired. Wait for next rotation." });

    const valid = await isValidCode(code, order.pickupCodeHash);
    if (!valid) return res.status(400).json({ message: "Invalid code" });

    order.status = "picked";
    await order.save();

    res.json({ message: "✅ Code verified successfully, order marked as picked" });
  } catch (err) {
    console.error("Verify code error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
