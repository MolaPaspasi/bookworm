import express from "express";
import cloudinary from "../lib/cloudinary.js";
import Package from "../models/Package.js";
import Rating from "../models/Rating.js";
import Food from "../models/Food.js";
import protectRoute from "../middleware/auth.middleware.js";

const router = express.Router();

// Create package (only companies can do this)
router.post("/", protectRoute, async (req, res) => {
  try {
    // Check if user is a company
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can add packages" });
    }

    const { 
      name, 
      description, 
      price, 
      packageType,
      foodItems,
      dietaryTypes,
      estimatedCalories,
      preparationTime,
      image 
    } = req.body;

    if (!name || !description || !price || !packageType) {
      return res.status(400).json({ message: "Please provide all required fields" });
    }

    // Upload the image to cloudinary if provided
    let imageUrl = "";
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    // Save to the database
    const newPackage = new Package({
      name,
      description,
      price,
      packageType,
      foodItems: foodItems || [],
      dietaryTypes: dietaryTypes || [],
      estimatedCalories,
      preparationTime: preparationTime || 30,
      company: req.user._id,
    });

    // Only set image if it exists
    if (imageUrl) {
      newPackage.image = imageUrl;
    }

    await newPackage.save();

    // Populate company info
    await newPackage.populate("company", "username companyName companyAddress");

    res.status(201).json(newPackage);
  } catch (error) {
    console.log("Error creating package", error);
    res.status(500).json({ message: error.message });
  }
});

// Get all packages
router.get("/", protectRoute, async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const skip = (page - 1) * limit;
    const packageType = req.query.packageType;
    const search = req.query.search;

    // Build query
    let query = { isAvailable: true };
    
    if (packageType && packageType !== "all") {
      query.packageType = packageType;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
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
    console.log("Error in get all packages route", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get foods by company (for company dashboard)
router.get("/company", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can access this route" });
    }

    const foods = await Food.find({ company: req.user._id })
      .sort({ createdAt: -1 });
    res.json(foods);
  } catch (error) {
    console.error("Get company foods error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Update food (only companies can do this)
router.put("/:id", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can update food items" });
    }

    const food = await Food.findById(req.params.id);
    if (!food) return res.status(404).json({ message: "Food not found" });

    // Check if user is the owner of the food
    if (food.company.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const updateData = { ...req.body };
    
    // Handle image upload if new image provided
    if (updateData.image && updateData.image !== food.image) {
      const uploadResponse = await cloudinary.uploader.upload(updateData.image);
      updateData.image = uploadResponse.secure_url;
    }

    const updatedFood = await Food.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate("company", "username companyName");

    res.json(updatedFood);
  } catch (error) {
    console.log("Error updating food", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Delete food (only companies can do this)
router.delete("/:id", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can delete food items" });
    }

    const food = await Food.findById(req.params.id);
    if (!food) return res.status(404).json({ message: "Food not found" });

    // Check if user is the owner of the food
    if (food.company.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Delete image from cloudinary
    if (food.image && food.image.includes("cloudinary")) {
      try {
        const publicId = food.image.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(publicId);
      } catch (deleteError) {
        console.log("Error deleting image from cloudinary", deleteError);
      }
    }

    // Delete all ratings for this food
    await Rating.deleteMany({ food: req.params.id });

    await food.deleteOne();

    res.json({ message: "Food deleted successfully" });
  } catch (error) {
    console.log("Error deleting food", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Rate food (only customers can do this)
router.post("/:id/rate", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Only customers can rate food items" });
    }

    const { rating, comment } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const food = await Food.findById(req.params.id);
    if (!food) return res.status(404).json({ message: "Food not found" });

    // Check if customer already rated this food
    const existingRating = await Rating.findOne({
      food: req.params.id,
      customer: req.user._id
    });

    if (existingRating) {
      return res.status(400).json({ message: "You have already rated this food item" });
    }

    // Create new rating
    const newRating = new Rating({
      food: req.params.id,
      customer: req.user._id,
      rating,
      comment: comment || ""
    });

    await newRating.save();

    // Update food's average rating
    const allRatings = await Rating.find({ food: req.params.id });
    const totalRating = allRatings.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = totalRating / allRatings.length;

    await Food.findByIdAndUpdate(req.params.id, {
      averageRating: Math.round(averageRating * 10) / 10,
      ratingCount: allRatings.length
    });

    res.status(201).json(newRating);
  } catch (error) {
    console.log("Error rating food", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get ratings for a specific food
router.get("/:id/ratings", protectRoute, async (req, res) => {
  try {
    const ratings = await Rating.find({ food: req.params.id })
      .populate("customer", "username profileImage")
      .sort({ createdAt: -1 });

    res.json(ratings);
  } catch (error) {
    console.log("Error getting ratings", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Add mystery food item (only companies can do this)
router.post("/mystery", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can add mystery food items" });
    }

    const { name, description, price, ingredients, allergens, image } = req.body;

    if (!name || !description || !price || !ingredients || !allergens) {
      return res.status(400).json({ message: "Please provide all required fields" });
    }

    let imageUrl = "";
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    const newFood = new Food({
      name,
      description,
      price,
      ingredients,
      allergens,
      isMystery: true,
      company: req.user._id,
      image: imageUrl,
    });

    await newFood.save();
    res.status(201).json(newFood);
  } catch (error) {
    console.error("Error creating mystery food item", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get food items with allergen warnings
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
