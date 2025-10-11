import express from "express";
import cors from "cors";
import "dotenv/config";
import job from "./lib/cron.js";

import authRoutes from "./routes/authRoutes.js";
import foodRoutes from "./routes/foodRoutes.js";
import packageRoutes from "./routes/packageRoutes.js"; // Import the package routes

import { connectDB } from "./lib/db.js";

const app = express();
const PORT = process.env.PORT || 3000;

job.start();
app.use(express.json());


app.use(cors());

app.use("/api/auth", authRoutes);
app.use("/api/foods", foodRoutes);
app.use("/api/packages", packageRoutes); // Register the packages route

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  connectDB();
});