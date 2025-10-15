// models/Order.js
import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [
    {
      package: { type: mongoose.Schema.Types.ObjectId, ref: "Package", required: true },
      quantity: { type: Number, required: true, min: 1 },
    },
  ],
  totalAmount: { type: Number, required: true },

  // hashed pickup code (PIN)
  pickupCodeHash: { type: String, required: true },

  // kodun üretildiği zaman
  codeGeneratedAt: { type: Date, required: true },

  // sipariş durumu
  status: {
    type: String,
    enum: ["pending", "confirmed", "ready", "picked", "completed", "cancelled"],
    default: "pending",
  },

  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Order", orderSchema);
