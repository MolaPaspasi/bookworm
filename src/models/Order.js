import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [
    {
      package: { type: mongoose.Schema.Types.ObjectId, ref: "Package", required: true },
      quantity: { type: Number, required: true },
    },
  ],
  totalAmount: { type: Number, required: true },
  status: {
    type: String,
    enum: ["pending", "confirmed", "picked", "completed", "cancelled"],
    default: "pending",
  },
  pickupCodeHash: { type: String },  // aktif kodun hashlenmiş hali
  codeGeneratedAt: { type: Date },   // en son kodun oluşturulma zamanı
}, { timestamps: true });             // ✅ createdAt & updatedAt otomatik gelir

const Order = mongoose.model("Order", orderSchema);
export default Order;
