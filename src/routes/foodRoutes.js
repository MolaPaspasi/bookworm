import express from "express";
import cloudinary from "../lib/cloudinary.js";
import Food from "../models/Food.js";
import protectRoute from "../middleware/auth.middleware.js";

const router = express.Router();

/* =========================================================================
   🍽️ GET FOODS (public for logged users)
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

    const foods = await Food.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("company", "username companyName companyAddress");

    const totalFoods = await Food.countDocuments(query);
    res.json({
      foods,
      currentPage: page,
      totalFoods,
      totalPages: Math.ceil(totalFoods / limit),
    });
  } catch (error) {
    console.error("Error listing foods:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   🏢 COMPANY: List own foods
   ========================================================================= */
router.get("/company", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can access this route" });
    }

    const foods = await Food.find({ company: req.user._id }).sort({ createdAt: -1 });
    res.json(foods);
  } catch (error) {
    console.error("Error listing company foods:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   ➕ CREATE FOOD (ONLY COMPANY)
   ========================================================================= */
router.post("/", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can create foods" });
    }

    const {
      name,
      description,
      itemType,
      originalPrice,
      discountedPrice,
      stock,
      allergens = [],
      dietaryTypes = [],
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

    const food = await Food.create({
  name,
  description,
  originalPrice,
  discountedPrice,
  stock: typeof stock === "number" ? stock : 0,
  allergens,
  dietaryTypes,
  image: imageUrl || undefined,
  company: req.user._id,
    itemType: itemType || "food",
  isAvailable: true,
});

    await food.populate("company", "username companyName companyAddress");
    res.status(201).json(food);
  } catch (error) {
    console.error("Error creating food:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   ✏️ UPDATE FOOD (ONLY OWNER COMPANY)
   ========================================================================= */
router.put("/:id", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can update foods" });
    }

    const existing = await Food.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Food not found" });
    if (existing.company.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const update = { ...req.body };
    if (update.image && update.image !== existing.image) {
      const upload = await cloudinary.uploader.upload(update.image);
      update.image = upload.secure_url;
    }

    const updated = await Food.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate("company", "username companyName companyAddress");

    res.json(updated);
  } catch (error) {
    console.error("Error updating food:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   ❌ DELETE FOOD (ONLY OWNER COMPANY)
   ========================================================================= */
router.delete("/:id", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can delete foods" });
    }

    const existing = await Food.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Food not found" });
    if (existing.company.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await existing.deleteOne();
    res.json({ message: "Food deleted successfully" });
  } catch (error) {
    console.error("Error deleting food:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   🍽️ GET SINGLE FOOD DETAILS
   ========================================================================= */
router.get("/:id", protectRoute, async (req, res) => {
  try {
    const { id } = req.params;

    const food = await Food.findById(id).populate(
      "company",
      "username companyName companyAddress profileImage"
    );

    if (!food) return res.status(404).json({ message: "Food not found" });

    res.json({ food });
  } catch (error) {
    console.error("Error fetching food details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   🍽️ RESERVE FOOD STOCK (CUSTOMERS ONLY)
   ========================================================================= */
router.put("/:id/reserve", protectRoute, async (req, res) => {
  try {
    const { quantity } = req.body;
    const food = await Food.findById(req.params.id);
    if (!food) return res.status(404).json({ message: "Food not found" });

    if (quantity > food.stock)
      return res.status(400).json({ message: "Not enough stock available." });

    food.stock = food.stock - 1;
    await food.save();

    // 5 dakika sonra rezervasyonu iade et
    setTimeout(async () => {
      const item = await Food.findById(req.params.id);
      if (item) {
        item.stock = item.stock + 1;
        await item.save();
      }
    }, 10 * 30 * 1000);

    res.json({ message: "Stock reserved successfully", food });
  } catch (err) {
    console.error("Reserve error:", err);
    res.status(500).json({ message: "Unable to reserve stock for this food." });
  }
});

export default router;
