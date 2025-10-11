import mongoose from "mongoose";

const packageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      default: "",
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    // Multiple food items in the mystery package
    foodItems: [{
      name: {
        type: String,
        required: true,
      },
      description: String,
      ingredients: [String],
      allergens: [String],
    }],
    // Package type (mystery, themed, etc.)
    packageType: {
      type: String,
      required: true,
      enum: ["mystery", "food"],
      
    },
    // Dietary preferences this package caters to
    dietaryTypes: [{
      type: String,
      enum: ["vegetarian", "vegan", "gluten-free", "dairy-free", "halal", "kosher", "keto", "low-carb", "spicy", "mild"],
    }],
    // Estimated total calories
    estimatedCalories: {
      type: Number,
      min: 0,
    },
    // Preparation time for the entire package
    preparationTime: {
      type: Number, // in minutes
      default: 30,
    },
    // Company that owns this package
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Overall rating (calculated from individual ratings)
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    // Number of ratings received
    ratingCount: {
      type: Number,
      default: 0,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Add indexes for better performance
packageSchema.index({ company: 1 });
packageSchema.index({ packageType: 1 });
packageSchema.index({ averageRating: -1 });
packageSchema.index({ createdAt: -1 });

const Package = mongoose.model("Package", packageSchema);

export default Package;
