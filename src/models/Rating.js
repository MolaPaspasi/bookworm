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
ratingSchema.index({ rating: 1 });

const Rating = mongoose.model("Rating", ratingSchema);

export default Rating;
