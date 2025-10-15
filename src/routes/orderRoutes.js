import express from "express";
import protectRoute from "../middleware/auth.middleware.js";
import Order from "../models/Order.js";
import { generateHashedCode, isValidCode } from "../utils/rotatingCode.js";

const router = express.Router();

/* 🧾 CREATE ORDER (customer) */
router.post("/", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Only customers can create orders" });
    }

    const { company, items, totalAmount } = req.body;
    if (!company || !items || !totalAmount) {
      return res.status(400).json({ message: "Missing required fields" });
    }

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
      pickupCode: plain, // ilk 10 sn'lik kod
      createdAt: order.createdAt,
    });
  } catch (err) {
    console.error("Order creation error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* 👤 GET MY ORDERS (customer) */
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

/* 🏢 GET COMPANY ORDERS */
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

/* ✅ VERIFY CODE (company only) */
router.post("/:id/verify-code", protectRoute, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (req.user.role !== "company" || String(req.user._id) !== String(order.company)) {
      return res.status(403).json({ message: "Not authorized to verify this order" });
    }

    const { code } = req.body;
    if (!code) return res.status(400).json({ message: "Code required" });

    // kodun süresi geçti mi?
    const expired = Date.now() - new Date(order.codeGeneratedAt).getTime() > 10000;
    if (expired) return res.status(400).json({ message: "Code expired. Wait for next rotation." });

    const valid = await isValidCode(code, order.pickupCodeHash);
    if (!valid) return res.status(400).json({ message: "Invalid code" });

    order.status = "picked";
    await order.save();

    res.json({ message: "✅ Code verified, order marked as picked" });
  } catch (err) {
    console.error("Verify code error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
