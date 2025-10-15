import express from "express";
import cloudinary from "../lib/cloudinary.js";
import Package from "../models/Package.js";
import protectRoute from "../middleware/auth.middleware.js";
import Rating from "../models/Rating.js";
import Food from "../models/Food.js";
import User from "../models/User.js";
import Reservation from "../models/Reservation.js";

const router = express.Router();

/* =========================================================================
   📦 LIST PACKAGES (PUBLIC FOR LOGGED USERS)
   Supports: ?page, ?limit, ?company, ?search
   ========================================================================= */
router.get("/", protectRoute, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const company = req.query.company;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const query = { isAvailable: true };
    if (company) query.company = company;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const packages = await Package.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("company", "username companyName companyAddress");

    const totalPackages = await Package.countDocuments(query);
    res.json({
      packages,
      currentPage: page,
      totalPackages,
      totalPages: Math.ceil(totalPackages / limit),
    });
  } catch (error) {
    console.error("Error listing packages:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   🏢 COMPANY: List own packages
   ========================================================================= */
router.get("/company", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can access this route" });
    }

    const packages = await Package.find({ company: req.user._id }).sort({ createdAt: -1 });
    res.json(packages);
  } catch (error) {
    console.error("Error listing company packages:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   ➕ CREATE PACKAGE (ONLY COMPANY)
   ========================================================================= */
router.post("/", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can create packages" });
    }

    const {
      name,
      description,
      originalPrice,
      discountedPrice,
      stock,
      allergens = [],
      mealType,
      image,
    } = req.body;

    if (!name || !originalPrice || !discountedPrice) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    let imageUrl = "";
    if (image) {
      const upload = await cloudinary.uploader.upload(image);
      imageUrl = upload.secure_url;
    }

    const newPackage = await Package.create({
      name,
      description,
      originalPrice,
      discountedPrice,
      stock: typeof stock === "number" ? stock : 0,
      allergens,
      mealType,
      image: imageUrl || undefined,
      company: req.user._id,
    });

    await newPackage.populate("company", "username companyName companyAddress");
    res.status(201).json(newPackage);
  } catch (error) {
    console.error("Error creating package:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   ✏️ UPDATE PACKAGE (ONLY OWNER COMPANY)
   ========================================================================= */
router.put("/:id", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can update packages" });
    }

    const existing = await Package.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Package not found" });
    if (existing.company.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const update = { ...req.body };
    if (update.image && update.image !== existing.image) {
      const upload = await cloudinary.uploader.upload(update.image);
      update.image = upload.secure_url;
    }

    const updated = await Package.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate("company", "username companyName companyAddress");

    res.json(updated);
  } catch (error) {
    console.error("Error updating package:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   ❌ DELETE PACKAGE (ONLY OWNER COMPANY)
   ========================================================================= */
router.delete("/:id", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can delete packages" });
    }

    const existing = await Package.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Package not found" });
    if (existing.company.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await existing.deleteOne();
    res.json({ message: "Package deleted successfully" });
  } catch (error) {
    console.error("Error deleting package:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
