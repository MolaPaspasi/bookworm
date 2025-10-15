import mongoose from "mongoose";

const foodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    image: { type: String, default: "" },

    originalPrice: { type: Number, required: true, min: 0 },
    discountedPrice: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, default: 0 },
    allergens: [String],

    dietaryTypes: [String],
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    averageRating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Food", foodSchema);
