import mongoose from "mongoose";

const ratingSchema = new mongoose.Schema(
  {
    food: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Food",
      required: false, // Artık opsiyonel, order-based rating için
    },
    package: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Package",
      required: false, // Artık opsiyonel, order-based rating için
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // company reference (for listing later)
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true, // Order-based rating için zorunlu
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      maxlength: 500,
    },

    // 💬 Şirket cevabı
    companyReply: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

// Ensure one rating per customer per order
ratingSchema.index(
  { order: 1, customer: 1 },
  { unique: true }
);

// Legacy indexes for food/package ratings (if needed in future)
// Note: These indexes are disabled to prevent conflicts with order-based ratings
// ratingSchema.index(
//   { food: 1, customer: 1 },
//   { unique: true, partialFilterExpression: { food: { $exists: true } } }
// );
// ratingSchema.index(
//   { package: 1, customer: 1 },
//   { unique: true, partialFilterExpression: { package: { $exists: true } } }
// );

// Add indexes for better performance
ratingSchema.index({ food: 1 });
ratingSchema.index({ package: 1 });
ratingSchema.index({ customer: 1 });
ratingSchema.index({ company: 1 });
ratingSchema.index({ order: 1 });
ratingSchema.index({ rating: 1 });

const Rating = mongoose.model("Rating", ratingSchema);
export default Rating;
