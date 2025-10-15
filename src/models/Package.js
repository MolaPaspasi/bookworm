import mongoose from "mongoose";

const packageSchema = new mongoose.Schema(
  {
    // 📦 Common Fields
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    image: {
      type: String,
      default: "",
    },

    // 💡 itemType: "food" or "mystery"
    itemType: {
      type: String,
      enum: ["food", "mystery"],
      required: true,
      default: "food",
    },

    // 🍽️ Meal Type (for food & mystery)
    mealType: {
      type: String,
      enum: ["breakfast", "lunch", "dinner", "dessert"],
      default: "lunch",
    },

    // 💰 Pricing
    originalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    discountedPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    // 📦 Stock
    stock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    // ⚠️ Allergens
    allergens: {
      type: [String],
      default: [],
    },

    // 🥗 Dietary types
    dietaryTypes: {
      type: [String],
      enum: [
        "vegetarian",
        "vegan",
        "gluten-free",
        "dairy-free",
        "halal",
        "kosher",
        "keto",
        "low-carb",
        "spicy",
        "mild",
      ],
      default: [],
    },

    // ⭐ Ratings
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingCount: {
      type: Number,
      default: 0,
    },

    // 🏢 Company relation
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ✅ Status
    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// 🔍 Indexes for faster search/sorting
packageSchema.index({ company: 1 });
packageSchema.index({ itemType: 1 });
packageSchema.index({ mealType: 1 });
packageSchema.index({ averageRating: -1 });
packageSchema.index({ createdAt: -1 });

const Package = mongoose.model("Package", packageSchema);
export default Package;
