import express from "express";
import cloudinary from "../lib/cloudinary.js";
import Package from "../models/Package.js";
import Rating from "../models/Rating.js";
import Food from "../models/Food.js";
import User from "../models/User.js";
import protectRoute from "../middleware/auth.middleware.js";

const router = express.Router();

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* =========================================================================
   📦 LIST PACKAGES (PUBLIC FOR LOGGED USERS)
   Supports: ?page, ?limit, ?packageType, ?company, ?search
   ========================================================================= */
router.get("/", protectRoute, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const packageType = req.query.packageType;
    const companyId = req.query.company;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const query = { isAvailable: true };
    if (packageType && packageType !== "all") query.packageType = packageType;
    if (companyId) query.company = companyId;

    if (search) {
      const safeSearch = escapeRegex(search);
      const searchRegex = new RegExp(safeSearch, "i");

      // find matching companies by name/username/address
      const matchingCompanyIds = await User.distinct("_id", {
        role: "company",
        $or: [
          { companyName: searchRegex },
          { username: searchRegex },
          { companyAddress: searchRegex },
        ],
      });

      query.$or = [{ name: searchRegex }, { description: searchRegex }];
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
   🏢 COMPANY: LIST OWN PACKAGES
   ========================================================================= */
router.get("/company", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can access this route" });
    }

    const packages = await Package.find({ company: req.user._id }).sort({ createdAt: -1 });
    res.json(packages);
  } catch (error) {
    console.error("Error fetching company packages:", error);
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
   ⚠️ GET ALLERGEN INFO (from Food collection)
   ========================================================================= */
router.get("/allergens", protectRoute, async (_req, res) => {
  try {
    const foods = await Food.find({ isAvailable: true }).populate(
      "company",
      "username companyName"
    );

    const result = foods.map((food) => ({
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

/* =========================================================================
   ➕ CREATE PACKAGE (ONLY COMPANY)
   Note: Only 1 "mystery" bag per company (business rule)
   ========================================================================= */
router.post("/", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can add packages" });
    }

    const {
      name,
      description,
      price,
      packageType, // e.g. "mystery"
      foodItems = [],
      dietaryTypes = [],
      estimatedCalories,
      image,
    } = req.body;

    if (!name || !description || !price || !packageType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Only restrict uniqueness for "mystery" bags
    if (packageType === "mystery") {
      const hasMystery = await Package.exists({
        company: req.user._id,
        packageType: "mystery",
      });
      if (hasMystery) {
        return res
          .status(400)
          .json({ message: "Each company can only create one mystery bag" });
      }
    }

    // Upload image (optional)
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
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can update packages" });
    }

    const existingPackage = await Package.findById(req.params.id);
    if (!existingPackage) {
      return res.status(404).json({ message: "Package not found" });
    }

    if (existingPackage.company.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const updateData = { ...req.body };

    // If image changed, upload new one
    if (updateData.image && updateData.image !== existingPackage.image) {
      const uploadResponse = await cloudinary.uploader.upload(updateData.image);
      updateData.image = uploadResponse.secure_url;
    }

    const updatedPackage = await Package.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate("company", "username companyName companyAddress");

    res.json(updatedPackage);
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

    const existingPackage = await Package.findById(req.params.id);
    if (!existingPackage) {
      return res.status(404).json({ message: "Package not found" });
    }

    if (existingPackage.company.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Optional: delete Cloudinary asset (best if you stored public_id)
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
   🧾 GET SINGLE PACKAGE DETAILS (+ related foods & ratings)
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

    // Other foods from the same company (to show under the mystery bag)
    const relatedFoods = await Food.find({
      company: pack.company?._id,
      isAvailable: true,
    })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ package: pack, ratings, relatedFoods });
  } catch (error) {
    console.error("Error fetching package details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
