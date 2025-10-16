import express from "express";
import protectRoute from "../middleware/auth.middleware.js";
import Order from "../models/Order.js";
import { generateHashedCode, isValidCode } from "../utils/rotatingCode.js";
import Rating from "../models/Rating.js";

const router = express.Router();

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

    const order = await Order.create({
      customer: req.user._id,
      company,
      items,
      totalAmount,
      status: "confirmed",
    });

    res.status(201).json({
      message: "Order created successfully",
      orderId: order._id,
      createdAt: order.createdAt,
    });
  } catch (err) {
    console.error("Order creation error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   👤 GET MY ORDERS (CUSTOMER) - Confirmed orders only
   ========================================================================= */
router.get("/my", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Only customers can view their orders" });
    }

   const orders = await Order.find({
      customer: req.user._id,
      status: "confirmed", // ✅ sadece confirmed siparişleri getir
    })
      .populate("company", "companyName username")
      .populate("items.package", "name price")
      .populate("items.food", "name price")
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    console.error("Fetch my orders error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   👤 GET ALL MY ORDERS (CUSTOMER) - All statuses
   ========================================================================= */
router.get("/my/all", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Only customers can view their orders" });
    }

    const orders = await Order.find({
      customer: req.user._id,
    })
      .populate("company", "companyName username")
      .populate("items.package", "name price")
      .populate("items.food", "name price")
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    console.error("Fetch all my orders error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});
/* =========================================================================
   📜 GET CUSTOMER COMPLETED ORDERS (HISTORY)
   ========================================================================= */
router.get("/my/history", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Only customers can view history" });
    }

    const orders = await Order.find({
      customer: req.user._id,
      status: "completed", // ✅ sadece tamamlanmış siparişleri getir
    })
      .populate("company", "companyName username")
      .populate("items.package", "name price")
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    console.error("Fetch customer completed orders error:", err);
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
   💬 LEAVE FEEDBACK (CUSTOMER ONLY)
   ========================================================================= */
router.post("/:id/feedback", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "customer")
      return res.status(403).json({ message: "Only customers can leave feedback" });

    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ message: "Rating must be between 1 and 5" });

    const order = await Order.findById(req.params.id)
      .populate("company")
      .populate("items.package");

    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.customer.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Not your order" });
    if (order.status !== "picked")
      return res.status(400).json({ message: "You can only rate picked orders" });

    // zaten feedback bırakmış mı?
    const existing = await Rating.findOne({ order: order._id, customer: req.user._id });
    if (existing)
      return res.status(400).json({ message: "Feedback already submitted" });

    // her package için rating oluştur
    for (const item of order.items) {
      await Rating.create({
        order: order._id,
        customer: req.user._id,
        company: order.company._id,
        package: item.package._id,
        rating,
        comment,
      });
    }

    order.status = "completed";
    await order.save();

    res.status(201).json({ message: "Feedback submitted successfully" });
  } catch (err) {
    console.error("Feedback error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});
/* =========================================================================
   💬 COMPANY REPLY TO FEEDBACK
   ========================================================================= */
router.post("/:id/reply", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company")
      return res.status(403).json({ message: "Only companies can reply" });

    const { reply } = req.body;
    if (!reply?.trim())
      return res.status(400).json({ message: "Reply cannot be empty" });

    const rating = await Rating.findOne({ order: req.params.id });
    if (!rating)
      return res.status(404).json({ message: "Rating not found" });

    if (rating.company.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Not authorized" });

    if (rating.companyReply)
      return res.status(400).json({ message: "Reply already submitted" });

    rating.companyReply = reply.trim();
    await rating.save();

    res.json({ message: "Reply added successfully" });
  } catch (err) {
    console.error("Reply error:", err);
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
// ✅ get current pickup code (customer only) - sadece customer istediğinde üret
router.get("/:id/code", protectRoute, async (req, res) => {
  try {
    console.log("PIN request for order:", req.params.id, "by user:", req.user._id);
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      console.log("Order not found:", req.params.id);
      return res.status(404).json({ message: "Order not found" });
    }
    
    if (req.user.role !== "customer" || String(order.customer) !== String(req.user._id)) {
      console.log("Not authorized - role:", req.user.role, "customer:", order.customer);
      return res.status(403).json({ message: "Not authorized" });
    }

    console.log("Order found, status:", order.status, "hasCode:", !!order.pickupCodeHash);

    // Eğer PIN henüz üretilmemişse veya süresi dolmuşsa yeni PIN üret
    if (!order.pickupCodeHash || !order.codeGeneratedAt) {
      console.log("Generating new PIN - no existing code");
      const { plain, hash } = await generateHashedCode();
      order.pickupCodeHash = hash;
      order.codeGeneratedAt = new Date();
      await order.save();
      console.log("New PIN generated:", plain);
      return res.json({ 
        pickupCode: plain,
        codeGeneratedAt: order.codeGeneratedAt,
        expiresIn: 20000 // 20 saniye
      });
    }

    const expired = Date.now() - new Date(order.codeGeneratedAt).getTime() > 20000;
    if (expired) {
      console.log("PIN expired, generating new one");
      const { plain, hash } = await generateHashedCode();
      order.pickupCodeHash = hash;
      order.codeGeneratedAt = new Date();
      await order.save();
      console.log("New PIN generated after expiry:", plain);
      return res.json({ 
        pickupCode: plain,
        codeGeneratedAt: order.codeGeneratedAt,
        expiresIn: 20000
      });
    }

    // PIN hala geçerli, süreyi hesapla
    const remainingTime = 20000 - (Date.now() - new Date(order.codeGeneratedAt).getTime());
    console.log("PIN still valid, remaining time:", remainingTime);
    return res.json({ 
      pickupCode: "••••••", // PIN'i gizle
      codeGeneratedAt: order.codeGeneratedAt,
      expiresIn: Math.max(0, remainingTime)
    });
  } catch (err) {
    console.error("Code fetch error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
