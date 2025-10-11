import express from "express";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import protectRoute from "../middleware/auth.middleware.js";

const router = express.Router();

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "15d" });
};

router.post("/register", async (req, res) => {
  try {
    const { email, username, password, role, companyName, companyAddress } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password should be at least 6 characters long" });
    }

    if (username.length < 3) {
      return res.status(400).json({ message: "Username should be at least 3 characters long" });
    }

    // Validate role
    const validRoles = ["customer", "company"];
    const userRole = role || "customer";
    if (!validRoles.includes(userRole)) {
      return res.status(400).json({ message: "Invalid role. Must be 'customer' or 'company'" });
    }

    // If role is company, companyName and companyAddress are required
    if (userRole === "company" && !companyName) {
      return res.status(400).json({ message: "Company name is required for company accounts" });
    }
    
    if (userRole === "company" && !companyAddress) {
      return res.status(400).json({ message: "Company address is required for company accounts" });
    }

    // check if user already exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ message: "Username already exists" });
    }

    // get random avatar
    const profileImage = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;

    // Create user object with role and company fields
    const userData = {
      email,
      username,
      password,
      profileImage,
      role: userRole,
    };

    // Add company-specific fields if role is company
    if (userRole === "company") {
      userData.companyName = companyName;
      userData.companyAddress = companyAddress || "";
    }

    const user = new User(userData);

    await user.save();

    const token = generateToken(user._id);

    // Prepare response user object
    const responseUser = {
      id: user._id,
      username: user.username,
      email: user.email,
      profileImage: user.profileImage,
      role: user.role,
      createdAt: user.createdAt,
    };

    // Add company fields to response if role is company
    if (user.role === "company") {
      responseUser.companyName = user.companyName;
      responseUser.companyAddress = user.companyAddress;
    }

    res.status(201).json({
      token,
      user: responseUser,
    });
  } catch (error) {
    console.log("Error in register route", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) return res.status(400).json({ message: "All fields are required" });

    // check if user exists
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    // check if password is correct
    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) return res.status(400).json({ message: "Invalid credentials" });

    const token = generateToken(user._id);

    // Prepare response user object
    const responseUser = {
      id: user._id,
      username: user.username,
      email: user.email,
      profileImage: user.profileImage,
      role: user.role,
      createdAt: user.createdAt,
    };

    // Add company fields to response if role is company
    if (user.role === "company") {
      responseUser.companyName = user.companyName;
      responseUser.companyAddress = user.companyAddress;
    }

    res.status(200).json({
      token,
      user: responseUser,
    });
  } catch (error) {
    console.log("Error in login route", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Add or remove favorite restaurant
router.post("/favorites", protectRoute, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Only customers can manage favorite restaurants" });
    }

    const { restaurantId } = req.body;

    if (!restaurantId) {
      return res.status(400).json({ message: "Restaurant ID is required" });
    }

    const restaurant = await User.findById(restaurantId);
    if (!restaurant || restaurant.role !== "company") {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const isFavorite = req.user.favoriteRestaurants.includes(restaurantId);

    if (isFavorite) {
      req.user.favoriteRestaurants = req.user.favoriteRestaurants.filter(
        id => id.toString() !== restaurantId
      );
    } else {
      req.user.favoriteRestaurants.push(restaurantId);
    }

    await req.user.save();
    res.json({ favoriteRestaurants: req.user.favoriteRestaurants });
  } catch (error) {
    console.error("Error managing favorite restaurants", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;