import express from "express";
import cloudinary from "../lib/cloudinary.js";
import Package from "../models/Package.js";
import Rating from "../models/Rating.js";
import Food from "../models/Food.js";
import User from "../models/User.js";
import protectRoute from "../middleware/auth.middleware.js";

const router = express.Router();

const escapeRegex = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* =========================================================================
   📦 GET ALL PACKAGES (CUSTOMERS CAN SEE ALL)
   ========================================================================= */
router.get("/", protectRoute, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const packageType = req.query.packageType;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    // Build query
    const query = { isAvailable: true };
    if (packageType && packageType !== "all") query.packageType = packageType;

    if (search) {
      const safeSearch = escapeRegex(search);
      const searchRegex = new RegExp(safeSearch, "i");
      const matchingCompanyIds = await User.distinct("_id", {
        role: "company",
        $or: [
          { companyName: searchRegex },
          { username: searchRegex },
          { companyAddress: searchRegex },
        ],
      });

      query.$or = [
        { name: searchRegex },
        { description: searchRegex },
      ];

      if (matchingCompanyIds.length > 0) {
        query.$or.push({ company: { $in: matchingCompanyIds } });
      }
    }

    const packages = await Package.find(query)
      .sort({ averageRating: -1, createdAt: -1 })
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
    console.error("Error in get all packages route", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   🏢 GET COMPANY PACKAGES (FOR COMPANY DASHBOARD)
   ========================================================================= */
router.get("/company", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company")
      return res.status(403).json({ message: "Only companies can access this route" });

    const packages = await Package.find({ company: req.user._id })
      .sort({ createdAt: -1 });

    res.json(packages);
  } catch (error) {
    console.error("Error fetching company packages:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   ➕ CREATE PACKAGE (ONLY COMPANY)
   ========================================================================= */
router.post("/", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company")
      return res.status(403).json({ message: "Only companies can add packages" });

    const { name, description, price, packageType, foodItems = [], dietaryTypes = [], estimatedCalories, image } = req.body;

    if (!name || !description || !price || !packageType)
      return res.status(400).json({ message: "Missing required fields" });

    // Limit one package per company (if needed)
    const hasPackage = await Package.exists({ company: req.user._id });
    if (hasPackage)
      return res.status(400).json({ message: "Each company can only create one package" });

    // Upload image if provided
    let imageUrl = "";
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    const newPackage = new Package({
      name,
      description,
      price,
      packageType,
      foodItems,
      dietaryTypes,
      estimatedCalories,
      company: req.user._id,
      image: imageUrl || undefined,
    });

    await newPackage.save();
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
    if (req.user.role !== "company")
      return res.status(403).json({ message: "Only companies can update packages" });

    const existingPackage = await Package.findById(req.params.id);
    if (!existingPackage)
      return res.status(404).json({ message: "Package not found" });

    if (existingPackage.company.toString() !== req.user._id.toString())
      return res.status(401).json({ message: "Unauthorized" });

    const updateData = { ...req.body };

    if (updateData.image && updateData.image !== existingPackage.image) {
      const uploadResponse = await cloudinary.uploader.upload(updateData.image);
      updateData.image = uploadResponse.secure_url;
    }

    const updatedPackage = await Package.findByIdAndUpdate(req.params.id, updateData, { new: true })
      .populate("company", "username companyName companyAddress");

    res.json(updatedPackage);
  } catch (error) {
    console.error("Error updating package:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   ❌ DELETE PACKAGE
   ========================================================================= */
router.delete("/:id", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company")
      return res.status(403).json({ message: "Only companies can delete packages" });

    const existingPackage = await Package.findById(req.params.id);
    if (!existingPackage)
      return res.status(404).json({ message: "Package not found" });

    if (existingPackage.company.toString() !== req.user._id.toString())
      return res.status(401).json({ message: "Unauthorized" });

    // Optional: delete Cloudinary image
    if (existingPackage.image?.includes("cloudinary")) {
      try {
        const parts = existingPackage.image.split("/");
        const publicId = parts.slice(-2).join("/").split(".")[0];
        await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        console.warn("Cloudinary deletion warning:", err.message);
      }
    }

    await existingPackage.deleteOne();
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
    if (req.user.role !== "customer")
      return res.status(403).json({ message: "Only customers can rate packages" });

    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ message: "Rating must be between 1 and 5" });

    const pack = await Package.findById(req.params.id);
    if (!pack) return res.status(404).json({ message: "Package not found" });

    const existingRating = await Rating.findOne({ package: req.params.id, customer: req.user._id });
    if (existingRating)
      return res.status(400).json({ message: "You already rated this package" });

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
   🧾 GET PACKAGE RATINGS
   ========================================================================= */
router.get("/:id/ratings", protectRoute, async (req, res) => {
  try {
    const ratings = await Rating.find({ package: req.params.id })
      .populate("customer", "username profileImage")
      .sort({ createdAt: -1 });

    res.json(ratings);
  } catch (error) {
    console.error("Error getting ratings", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   ⚠️ GET ALLERGEN INFO
   ========================================================================= */
router.get("/allergens", protectRoute, async (req, res) => {
  try {
    const foods = await Food.find({ isAvailable: true })
      .populate("company", "username companyName");

    const result = foods.map(food => ({
      name: food.name,
      description: food.description,
      allergens: food.allergens,
      company: food.company,
    }));

    res.json(result);
  } catch (error) {
    console.error("Error fetching food items", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
