import express from "express";
import protectRoute from "../middleware/auth.middleware.js";
import Order from "../models/Order.js";
import Package from "../models/Package.js";
import Reservation from "../models/Reservation.js";
import { generateHashedCode, isValidCode } from "../utils/rotatingCode.js";

const router = express.Router();
const HISTORY_STATUSES = ["picked", "completed"];

const buildReservationMaps = async (packageIds) => {
  if (!Array.isArray(packageIds) || packageIds.length === 0) {
    return { reservedTotals: new Map(), reservedByCustomer: new Map() };
  }

  const now = new Date();
  const reservations = await Reservation.aggregate([
    {
      $match: {
        package: { $in: packageIds },
        expiresAt: { $gt: now },
      },
    },
    {
      $group: {
        _id: { package: "$package", customer: "$customer" },
        quantity: { $sum: "$quantity" },
      },
    },
  ]);

  const reservedTotals = new Map();
  const reservedByCustomer = new Map();

  reservations.forEach((entry) => {
    const pkgId = entry._id.package.toString();
    const customerId = entry._id.customer.toString();
    const qty = entry.quantity || 0;

    reservedTotals.set(pkgId, (reservedTotals.get(pkgId) || 0) + qty);

    if (!reservedByCustomer.has(pkgId)) {
      reservedByCustomer.set(pkgId, new Map());
    }
    reservedByCustomer.get(pkgId).set(customerId, qty);
  });

  return { reservedTotals, reservedByCustomer };
};

/* =========================================================================
   🧾 CREATE ORDER (CUSTOMER)
   ========================================================================= */
router.post("/", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Only customers can create orders" });
    }

    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    if (!rawItems.length) {
      return res.status(400).json({ message: "No items provided for the order" });
    }

    const items = rawItems.map((item) => ({
      package: item.package || item.packageId || item._id,
      quantity: Number(item.quantity ?? 1),
    }));

    if (items.some((item) => !item.package || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      return res.status(400).json({ message: "Each item must include a valid package and quantity" });
    }

    const packageIds = items.map((item) => item.package);
    const packages = await Package.find({ _id: { $in: packageIds } });

    if (packages.length !== items.length) {
      return res.status(400).json({ message: "One or more packages were not found" });
    }

    const packageMap = new Map(packages.map((pkg) => [pkg._id.toString(), pkg]));
    const companyId = packages[0].company?.toString();

    if (!companyId) {
      return res.status(400).json({ message: "Unable to determine company for selected packages" });
    }

    const allFromSameCompany = packages.every(
      (pkg) => pkg.company?.toString() === companyId
    );
    if (!allFromSameCompany) {
      return res
        .status(400)
        .json({ message: "All items in the order must belong to the same company" });
    }

    const { reservedTotals, reservedByCustomer } = await buildReservationMaps(packageIds);
    const userId = req.user._id.toString();

    let computedTotalAmount = 0;

    for (const item of items) {
      const pkg = packageMap.get(item.package.toString());
      if (!pkg) {
        return res.status(400).json({ message: "Package data is no longer available" });
      }

      const baseStock = typeof pkg.stock === "number" ? pkg.stock : 0;
      const reservedTotal = reservedTotals.get(pkg._id.toString()) || 0;
      const reservedByUser =
        reservedByCustomer.get(pkg._id.toString())?.get(userId) || 0;
      const reservedByOthers = reservedTotal - reservedByUser;
      const available = baseStock - reservedByOthers;

      if (available < item.quantity) {
        return res
          .status(400)
          .json({ message: `Insufficient stock available for ${pkg.name}` });
      }

      computedTotalAmount += (pkg.price || 0) * item.quantity;
    }

    const stockAdjustments = [];
    for (const item of items) {
      const updatedPackage = await Package.findOneAndUpdate(
        { _id: item.package, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
        { new: true }
      );

      if (!updatedPackage) {
        await Promise.all(
          stockAdjustments.map(({ packageId, quantity }) =>
            Package.updateOne({ _id: packageId }, { $inc: { stock: quantity } })
          )
        );
        return res
          .status(409)
          .json({ message: "Stock changed while processing the order. Please try again." });
      }

      stockAdjustments.push({ packageId: item.package, quantity: item.quantity });
    }

    const { plain, hash } = await generateHashedCode();

    const order = await Order.create({
      customer: req.user._id,
      company: companyId,
      items: items.map((item) => ({
        package: item.package,
        quantity: item.quantity,
      })),
      totalAmount: Number.isFinite(computedTotalAmount)
        ? Number(computedTotalAmount.toFixed(2))
        : 0,
      pickupCodeHash: hash,
      codeGeneratedAt: new Date(),
      status: "confirmed",
    });

    await Promise.all(
      items.map((item) =>
        Reservation.findOneAndDelete({
          package: item.package,
          customer: req.user._id,
        })
      )
    );

    res.status(201).json({
      message: "Order created successfully",
      orderId: order._id,
      pickupCode: plain,
      createdAt: order.createdAt,
      totalAmount: order.totalAmount,
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
