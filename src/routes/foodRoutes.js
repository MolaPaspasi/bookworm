// src/routes/foodRoutes.js
import express from "express";
import cloudinary from "../lib/cloudinary.js";
import Food from "../models/Food.js";
import protectRoute from "../middleware/auth.middleware.js";

const router = express.Router();

/* 🍽️ GET FOODS (customers see all foods, optional company filter) */
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

/* 🏢 COMPANY: list own foods */
router.get("/company", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company")
      return res.status(403).json({ message: "Only companies can access this route" });

    const foods = await Food.find({ company: req.user._id }).sort({ createdAt: -1 });
    res.json(foods);
  } catch (error) {
    console.error("Error listing company foods:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* ➕ CREATE FOOD (ONLY COMPANY) */
router.post("/", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company")
      return res.status(403).json({ message: "Only companies can create foods" });

    const { name, description, price, image, allergens = [], dietaryTypes = [] } = req.body;
    if (!name || !description || !price)
      return res.status(400).json({ message: "Missing required fields" });

    let imageUrl = "";
    if (image) {
      const upload = await cloudinary.uploader.upload(image);
      imageUrl = upload.secure_url;
    }

    const food = await Food.create({
      name,
      description,
      price,
      allergens,
      dietaryTypes,
      image: imageUrl || undefined,
      company: req.user._id,
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
   ➕ COMPANY: CREATE FOOD
   body: { name, description, price, image?, allergens?, dietaryTypes?, estimatedCalories? }
   ========================================================================= */
router.post("/", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company")
      return res.status(403).json({ message: "Only companies can create foods" });

    const { name, description, price, image, allergens = [], dietaryTypes = [], estimatedCalories } = req.body;

    if (!name || !description || !price)
      return res.status(400).json({ message: "Missing required fields" });

    let imageUrl = "";
    if (image) {
      const upload = await cloudinary.uploader.upload(image);
      imageUrl = upload.secure_url;
    }

    const food = await Food.create({
      name,
      description,
      price,
      allergens,
      dietaryTypes,
      estimatedCalories,
      image: imageUrl || undefined,
      company: req.user._id,
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
   ✏️ COMPANY: UPDATE FOOD
   ========================================================================= */
router.put("/:id", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company")
      return res.status(403).json({ message: "Only companies can update foods" });

    const existing = await Food.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Food not found" });
    if (existing.company.toString() !== req.user._id.toString())
      return res.status(401).json({ message: "Unauthorized" });

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
   ❌ COMPANY: DELETE FOOD
   ========================================================================= */
router.delete("/:id", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company")
      return res.status(403).json({ message: "Only companies can delete foods" });

    const existing = await Food.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Food not found" });
    if (existing.company.toString() !== req.user._id.toString())
      return res.status(401).json({ message: "Unauthorized" });

    await existing.deleteOne();
    res.json({ message: "Food deleted" });
  } catch (error) {
    console.error("Error deleting food:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
