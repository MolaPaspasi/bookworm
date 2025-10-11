import express from "express";
import cloudinary from "../lib/cloudinary.js";
import Package from "../models/Package.js";
import protectRoute from "../middleware/auth.middleware.js";

const router = express.Router();

/* ----------------------------- Create Package ----------------------------- */
// Only companies can create packages
router.post("/", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can add packages" });
    }

    const { 
      name, 
      description, 
      price, 
      packageType,
      foodItems = [],
      dietaryTypes = [],
      estimatedCalories,
      preparationTime = 30,
      image
    } = req.body;

    if (!name || !description || !price || !packageType) {
      return res.status(400).json({ message: "Please provide all required fields" });
    }

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
      preparationTime,
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

/* --------------------------- Get Company Packages -------------------------- */
// Get packages created by the logged-in company
router.get("/company", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can access this route" });
    }

    const packages = await Package.find({ company: req.user._id })
      .sort({ createdAt: -1 });

    res.json(packages);
  } catch (error) {
    console.error("Error fetching company packages:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* ----------------------------- Update Package ----------------------------- */
// Update package (only by owning company)
router.put("/:id", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can update packages" });
    }

    const existingPackage = await Package.findById(req.params.id);
    if (!existingPackage) return res.status(404).json({ message: "Package not found" });

    if (existingPackage.company.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const updateData = { ...req.body };

    // Handle new image upload
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

/* ----------------------------- Delete Package ----------------------------- */
// Delete package (only by owning company)
router.delete("/:id", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can delete packages" });
    }

    const existingPackage = await Package.findById(req.params.id);
    if (!existingPackage) return res.status(404).json({ message: "Package not found" });

    if (existingPackage.company.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Delete Cloudinary image if applicable
    if (existingPackage.image && existingPackage.image.includes("cloudinary")) {
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

export default router;
