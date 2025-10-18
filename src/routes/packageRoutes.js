import express from "express";
import cloudinary from "../lib/cloudinary.js";
import Package from "../models/Package.js";
import Food from "../models/Food.js";
import Rating from "../models/Rating.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import protectRoute from "../middleware/auth.middleware.js";

const router = express.Router();

/* =========================================================================
   🏢 GET COMPANIES (for customer homepage)
   Returns unique companies with their basic info and ratings
   ========================================================================= */
router.get("/companies", protectRoute, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get all companies that have packages (filter out null values)
    const companyIds = await Package.distinct("company", { company: { $ne: null } });
    
    const companies = await User.find({ 
      role: "company",
      _id: { $in: companyIds }
    })
    .select("username companyName companyAddress averageRating ratingCount")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    // Get total count
    const totalCompanies = await User.countDocuments({ 
      role: "company",
      _id: { $in: companyIds }
    });

    console.log(`📊 Found ${totalCompanies} companies, returning ${companies.length}`);

    res.json({
      companies,
      currentPage: page,
      totalCompanies,
      totalPages: Math.ceil(totalCompanies / limit),
    });
  } catch (error) {
    console.error("Error fetching companies:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   📦 LIST PACKAGES (for customers / search / filters)
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
      .populate("company", "username companyName companyAddress averageRating ratingCount");

    // Her package için rating bilgilerini hesapla (order-based rating'lerden)
    const packagesWithRatings = await Promise.all(
      packages.map(async (pkg) => {
        // Bu package'ı içeren order'ları bul
        const ordersWithPackage = await Order.find({
          "items.package": pkg._id,
          status: { $in: ["picked", "completed"] }
        });
        
        // Bu order'ların rating'lerini bul
        const orderIds = ordersWithPackage.map(order => order._id);
        const ratings = await Rating.find({ order: { $in: orderIds } });
        
        const totalRating = ratings.reduce((sum, rating) => sum + rating.rating, 0);
        const averageRating = ratings.length > 0 ? totalRating / ratings.length : 0;
        
        console.log(`Package ${pkg.name}: ${ratings.length} ratings, avg: ${averageRating.toFixed(1)}`);
        
        return {
          ...pkg.toObject(),
          averageRating: Math.round(averageRating * 10) / 10, // 1 decimal place
          ratingCount: ratings.length
        };
      })
    );

    const totalPackages = await Package.countDocuments(query);
    res.json({
      packages: packagesWithRatings,
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
   🏢 COMPANY: All products (both Food + Packages)
   ========================================================================= */
router.get("/all", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can access this route" });
    }

    const companyId = req.user._id;

    const [foods, packages] = await Promise.all([
      Food.find({ company: companyId })
        .sort({ createdAt: -1 })
        .populate("company", "username companyName companyAddress"),
      Package.find({ company: companyId })
        .sort({ createdAt: -1 })
        .populate("company", "username companyName companyAddress"),
    ]);

    res.json([...foods, ...packages]);
  } catch (error) {
    console.error("Error fetching company all products:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   ➕ CREATE PACKAGE (MYSTERY BAGS ONLY)
   ========================================================================= */
router.post("/", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can create packages" });
    }

    const {
      name,
      description,
      itemType = "mystery", // packages route'u sadece mystery bags için
      mealType, // "breakfast", "lunch", "dinner", "dessert"
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

    const newPackage = await Package.create({
      name,
      description,
      itemType: "mystery",
      mealType,
      originalPrice,
      discountedPrice,
      stock: typeof stock === "number" ? stock : 0,
      allergens,
      dietaryTypes,
      image: imageUrl || undefined,
      company: req.user._id,
      isAvailable: true,
    });

    await newPackage.populate("company", "username companyName companyAddress");
    res.status(201).json(newPackage);
  } catch (error) {
    console.error("Error creating package:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   ✏️ UPDATE PACKAGE (MYSTERY BAGS ONLY)
   ========================================================================= */
router.put("/:id", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can update packages" });
    }

    const { id } = req.params;
    const item = await Package.findById(id);

    if (!item) return res.status(404).json({ message: "Package not found" });
    if (item.company.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const update = { ...req.body };

    if (update.image && update.image !== item.image) {
      const upload = await cloudinary.uploader.upload(update.image);
      update.image = upload.secure_url;
    }

    const updated = await Package.findByIdAndUpdate(id, update, { new: true })
      .populate("company", "username companyName companyAddress");

    res.json(updated);
  } catch (error) {
    console.error("Error updating package:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   ❌ DELETE PACKAGE (MYSTERY BAGS ONLY)
   ========================================================================= */
router.delete("/:id", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "company") {
      return res.status(403).json({ message: "Only companies can delete packages" });
    }

    const { id } = req.params;
    const item = await Package.findById(id);

    if (!item) return res.status(404).json({ message: "Package not found" });
    if (item.company.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await item.deleteOne();
    res.json({ message: "Package deleted successfully" });
  } catch (error) {
    console.error("Error deleting package:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   ⭐ RATE (CUSTOMERS ONLY)
   ========================================================================= */
router.post("/:id/rate", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Only customers can rate items" });
    }

    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    // hem food hem package’ı ara
    let item = await Package.findById(req.params.id);
    if (!item) item = await Food.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Item not found" });

    const existingRating = await Rating.findOne({
      package: req.params.id,
      customer: req.user._id,
    });
    if (existingRating) {
      return res.status(400).json({ message: "You already rated this item" });
    }

    const newRating = await Rating.create({
      package: req.params.id,
      customer: req.user._id,
      rating,
      comment: comment || "",
    });

    const allRatings = await Rating.find({ package: req.params.id });
    const avg = allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;

    const Model = item.itemType === "food" ? Food : Package;
    await Model.findByIdAndUpdate(req.params.id, {
      averageRating: Math.round(avg * 10) / 10,
      ratingCount: allRatings.length,
    });

    res.status(201).json(newRating);
  } catch (error) {
    console.error("Error rating item:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
/* =========================================================================
   🧾 RESERVE PACKAGE STOCK
   ========================================================================= */
router.put("/:id/reserve", protectRoute, async (req, res) => {
  try {
    const { quantity } = req.body;

    const pack = await Package.findById(req.params.id);
    if (!pack) return res.status(404).json({ message: "Package not found" });

    // stok kontrolü
    if (quantity > pack.stock)
      return res.status(400).json({ message: "Not enough stock available." });

    // stoktan 1 düş
    pack.stock = pack.stock - 1;
    await pack.save();

    // 5 dakika sonra iade et (rezervasyon süresi)
    setTimeout(async () => {
      const item = await Package.findById(req.params.id);
      if (item) {
        item.stock = item.stock + 1;
        await item.save();
      }
    }, 10 * 30 * 1000);

    res.json({ message: "Stock reserved successfully", package: pack });
  } catch (err) {
    console.error("Reserve error:", err);
    res.status(500).json({ message: "Unable to reserve stock for this package." });
  }
});

/* =========================================================================
   🧾 GET SINGLE PACKAGE DETAILS
   ========================================================================= */
router.get("/:id", protectRoute, async (req, res) => {
  try {
    const { id } = req.params;

    const item = await Package.findById(id).populate(
      "company",
      "username companyName companyAddress profileImage"
    );

    if (!item) return res.status(404).json({ message: "Package not found" });

    const ratings = await Rating.find({ package: id })
      .populate("customer", "username profileImage")
      .sort({ createdAt: -1 });

    res.json({ package: item, ratings });
  } catch (error) {
    console.error("Error fetching package details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =========================================================================
   🏢 GET COMPANIES (for customer homepage)
   Returns unique companies with their packages and ratings
   ========================================================================= */
router.get("/companies", protectRoute, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get all packages with company info
    const packages = await Package.find({ isAvailable: true })
      .populate("company", "username companyName companyAddress averageRating ratingCount")
      .sort({ createdAt: -1 });

    // Group packages by company
    const companyMap = new Map();
    
    packages.forEach((pkg) => {
      const companyId = pkg.company?._id;
      if (!companyId) return;

      if (!companyMap.has(companyId)) {
        companyMap.set(companyId, {
          _id: companyId,
          companyName: pkg.company?.companyName || pkg.company?.username || "Restaurant",
          companyAddress: pkg.company?.companyAddress || "Address not provided",
          averageRating: pkg.company?.averageRating || 0,
          ratingCount: pkg.company?.ratingCount || 0,
          packages: [],
          minPrice: null,
          coverImage: null,
        });
      }

      const entry = companyMap.get(companyId);
      const price = Number(pkg.discountedPrice || pkg.originalPrice) || 0;
      
      entry.packages.push({
        _id: pkg._id,
        name: pkg.name,
        description: pkg.description,
        price,
        image: pkg.image,
        itemType: pkg.itemType,
      });

      entry.minPrice = entry.minPrice === null ? price : Math.min(entry.minPrice, price);
      
      if (!entry.coverImage && pkg.image) {
        entry.coverImage = pkg.image;
      }
    });

    // Convert to array and paginate
    const companies = Array.from(companyMap.values());
    const totalCompanies = companies.length;
    const paginatedCompanies = companies.slice(skip, skip + limit);

    console.log(`📊 Found ${totalCompanies} companies, returning ${paginatedCompanies.length}`);

    res.json({
      companies: paginatedCompanies,
      currentPage: page,
      totalCompanies,
      totalPages: Math.ceil(totalCompanies / limit),
    });
  } catch (error) {
    console.error("Error fetching companies:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
