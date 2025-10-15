import mongoose from "mongoose";

const reservationSchema = new mongoose.Schema(
  {
    package: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Package",
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

reservationSchema.index({ package: 1, customer: 1 }, { unique: true });
reservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Reservation = mongoose.model("Reservation", reservationSchema);

export default Reservation;
