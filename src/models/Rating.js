import mongoose from "mongoose";

const ratingSchema = new mongoose.Schema(
  {
    food: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Food",
      required: function () {
        return !this.package;
      },
    },
    package: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Package",
      required: function () {
        return !this.food;
      },
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
      required: false, // hangi order'dan geldiğini bilmek için
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

// Ensure one rating per customer per item type
ratingSchema.index(
  { food: 1, customer: 1 },
  { unique: true, partialFilterExpression: { food: { $exists: true } } }
);
ratingSchema.index(
  { package: 1, customer: 1 },
  { unique: true, partialFilterExpression: { package: { $exists: true } } }
);

// Add indexes for better performance
ratingSchema.index({ food: 1 });
ratingSchema.index({ package: 1 });
ratingSchema.index({ customer: 1 });
ratingSchema.index({ company: 1 });
ratingSchema.index({ order: 1 });
ratingSchema.index({ rating: 1 });

const Rating = mongoose.model("Rating", ratingSchema);
export default Rating;
