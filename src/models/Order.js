// models/Order.js
import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [
    {
      package: { type: mongoose.Schema.Types.ObjectId, ref: "Package", required: false },
      food: { type: mongoose.Schema.Types.ObjectId, ref: "Food", required: false },
      quantity: { type: Number, required: true, min: 1 },
    },
  ],
  totalAmount: { type: Number, required: true },

  // hashed pickup code (PIN)
  pickupCodeHash: { type: String, required: false },

  // plaintext pickup code (PIN) - customer'a gösterilecek
  pickupCodePlain: { type: String, required: false },

  // kodun üretildiği zaman
  codeGeneratedAt: { type: Date, required: false },

  // sipariş durumu
  status: {
    type: String,
    enum: ["pending", "confirmed", "ready", "picked", "completed", "cancelled"],
    default: "pending",
  },

  createdAt: { type: Date, default: Date.now },
});

// Validation: Her item'da en az bir food veya package olmalı
orderSchema.pre('save', function(next) {
  for (const item of this.items) {
    if (!item.package && !item.food) {
      return next(new Error('Each item must have either a package or food reference'));
    }
  }
  next();
});

export default mongoose.model("Order", orderSchema);
