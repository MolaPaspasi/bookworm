import express from "express";
import Package from "../models/Package.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Get packages by company (for company dashboard)
router.get("/company", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can access this route" });
    }

    const packages = await Package.find({ company: req.user._id }).sort({ createdAt: -1 });
    res.json(packages);
  } catch (error) {
    console.error("Get company packages error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;