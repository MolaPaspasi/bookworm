import express from "express";
import cors from "cors";
import "dotenv/config";
import job from "./lib/cron.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import packageRoutes from "./routes/packageRoutes.js";

import { connectDB } from "./lib/db.js";

const app = express();
const PORT = process.env.PORT || 3000;

job.start();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(cors());

app.use("/api/auth", authRoutes);
app.use("/api/packages", packageRoutes); // Register the packages route
app.use("/api/payment", paymentRoutes); // Register the foods route
app.use("/api/orders", orderRoutes); // Register the orders route

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  connectDB();
});
