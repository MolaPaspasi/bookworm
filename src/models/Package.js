import mongoose from "mongoose";

const packageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String, default: "" },

    itemType: { 
      type: String,
      enum: ["food", "mystery"], // 👈 artık sadece bu ayırıyor
      required: true,
    },

    mealType: {
      type: String,
      enum: ["breakfast", "lunch", "dinner", "dessert"],
      default: "lunch",
    },

    originalPrice: { type: Number, required: true, min: 0 },
    discountedPrice: { type: Number, required: true, min: 0 },

    stock: { type: Number, required: true, default: 0 },

    allergens: { type: [String], default: [] },
    dietaryTypes: { type: [String], default: [] },

    averageRating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    isAvailable: { type: Boolean, default: true },

    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

packageSchema.index({ company: 1 });
packageSchema.index({ itemType: 1 });
packageSchema.index({ averageRating: -1 });

const Package = mongoose.model("Package", packageSchema);
export default Package;
