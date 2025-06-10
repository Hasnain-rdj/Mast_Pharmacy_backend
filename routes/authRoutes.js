// Authentication routes for signup and login
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// Ensure JWT_SECRET is set in the .env file
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set in .env file');
}

// Endpoint to check if an admin already exists
router.get('/admin-exists', async (req, res) => {
  try {
    const admin = await User.findOne({ role: 'admin' });
    res.json({ exists: !!admin });
  } catch (err) {
    res.status(500).json({ exists: false });
  }
});

// Signup route
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, role, clinic } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (role === 'admin') {
      const adminExists = await User.findOne({ role: 'admin' });
      if (adminExists) {
        return res.status(400).json({ message: 'An admin account already exists. Only one admin is allowed.' });
      }
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword, role, clinic });
    await user.save();
    res.status(201).json({ message: 'User created successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }    const token = jwt.sign({ userId: user._id, role: user.role, clinic: user.clinic }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
    res.json({ token, user: { name: user.name, email: user.email, role: user.role, clinic: user.clinic, profilePic: user.profilePic } });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Password reset route
router.post('/reset-password', async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;
    if (!email || !oldPassword || !newPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Profile update route
router.put('/update-profile', async (req, res) => {
  try {
    const { email, name, profilePic } = req.body;
    if (!email || !name) {
      return res.status(400).json({ message: 'Email and name are required' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }    user.name = name;
    if (profilePic) user.profilePic = profilePic;
    await user.save();
    res.json({ 
      message: 'Profile updated successfully',
      user: { 
        name: user.name, 
        email: user.email, 
        role: user.role, 
        clinic: user.clinic, 
        profilePic: user.profilePic 
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Temporary test endpoint
router.get('/test-profile/:email', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email }).select('name email profilePic');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
