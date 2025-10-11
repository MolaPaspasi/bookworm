import mongoose from "mongoose";

const foodSchema = new mongoose.Schema(
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
    category: {
      type: String,
      required: true,
      enum: ["appetizer", "main-course", "dessert", "beverage", "salad", "soup", "pizza", "burger", "pasta", "other"],
    },
    ingredients: [{
      type: String,
    }],
    allergens: [{
      type: String,
    }],
    isAvailable: {
      type: Boolean,
      default: true,
    },
    isMystery: {
      type: Boolean,
      default: false,
    },
    // Company that owns this food
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
  },
  { timestamps: true }
);

// Add indexes for better performance
foodSchema.index({ company: 1 });
foodSchema.index({ category: 1 });
foodSchema.index({ averageRating: -1 });

const Food = mongoose.model("Food", foodSchema);

export default Food;