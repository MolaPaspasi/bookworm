import express from "express";
import cloudinary from "../lib/cloudinary.js";
import Package from "../models/Package.js";
import protectRoute from "../middleware/auth.middleware.js";
import Rating from "../models/Rating.js";
import User from "../models/User.js";
import Food from "../models/Food.js";
const router = express.Router();

/* =========================================================================
   📦 LIST PACKAGES (for customers / company profiles)
   Supports: ?page, ?limit, ?company, ?search, ?itemType (food/mystery)
   ========================================================================= */
router.get("/", protectRoute, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const { company, itemType, search } = req.query;
    const query = { isAvailable: true };

    if (company) query.company = company;
    if (itemType) query.itemType = itemType;

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
   🏢 COMPANY: All products (both Food + Mystery Packages)
   ========================================================================= */
router.get("/all", protectRoute, async (req, res) => {
  try {
    // sadece şirket hesabı erişebilir
    if (req.user.role !== "company") {
      return res
        .status(403)
        .json({ message: "Only companies can access this route" });
    }

    // sadece kendi ürünleri
    const companyId = req.user._id;

    const [foods, packages] = await Promise.all([
      Food.find({ company: companyId })
        .sort({ createdAt: -1 })
        .populate("company", "username companyName companyAddress"),
      Package.find({ company: companyId })
        .sort({ createdAt: -1 })
        .populate("company", "username companyName companyAddress"),
    ]);

    // birleştirip dön
    const allItems = [...foods, ...packages];
    res.json(allItems);
  } catch (error) {
    console.error("Error fetching company all products:", error);
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

    const packages = await Package.find({ company: req.user._id })
      .sort({ createdAt: -1 })
      .populate("company", "username companyName companyAddress");

    res.json(packages);
  } catch (error) {
    console.error("Error listing company packages:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   ➕ CREATE PACKAGE (FOOD or MYSTERY)
   ========================================================================= */
router.post("/", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can create packages" });
    }

    const {
      name,
      description,
      itemType, // "food" or "mystery"
      mealType, // "breakfast" | "lunch" | "dinner" | "dessert"
      originalPrice,
      discountedPrice,
      stock,
      allergens = [],
      dietaryTypes = [],
      image,
    } = req.body;

    if (!name || !originalPrice || !discountedPrice || !itemType) {
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
      itemType,
      mealType,
      originalPrice,
      discountedPrice,
      stock: typeof stock === "number" ? stock : 0,
      allergens,
      dietaryTypes,
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

/* =========================================================================
   ⭐ RATE PACKAGE (CUSTOMERS ONLY)
   ========================================================================= */
router.post("/:id/rate", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Only customers can rate packages" });
    }

    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const pack = await Package.findById(req.params.id);
    if (!pack) return res.status(404).json({ message: "Package not found" });

    const existingRating = await Rating.findOne({
      package: req.params.id,
      customer: req.user._id,
    });
    if (existingRating) {
      return res.status(400).json({ message: "You already rated this package" });
    }

    const newRating = await Rating.create({
      package: req.params.id,
      customer: req.user._id,
      rating,
      comment: comment || "",
    });

    const allRatings = await Rating.find({ package: req.params.id });
    const avg = allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;

    await Package.findByIdAndUpdate(req.params.id, {
      averageRating: Math.round(avg * 10) / 10,
      ratingCount: allRatings.length,
    });

    res.status(201).json(newRating);
  } catch (error) {
    console.error("Error rating package:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   🧾 GET SINGLE PACKAGE DETAILS
   ========================================================================= */
router.get("/:id", protectRoute, async (req, res) => {
  try {
    const pack = await Package.findById(req.params.id).populate(
      "company",
      "username companyName companyAddress profileImage"
    );

    if (!pack) return res.status(404).json({ message: "Package not found" });

    const ratings = await Rating.find({ package: req.params.id })
      .populate("customer", "username profileImage")
      .sort({ createdAt: -1 });

    res.json({ package: pack, ratings });
  } catch (error) {
    console.error("Error fetching package details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
