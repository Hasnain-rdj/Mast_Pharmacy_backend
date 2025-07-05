const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  fontSize: { 
    type: String, 
    enum: ['small', 'medium', 'large'], 
    default: 'medium' 
  },
  boldFont: { 
    type: Boolean, 
    default: false 
  },
  showPrices: { 
    type: Boolean, 
    default: true 
  },
  clinicsHidePrices: { 
    type: [String], 
    default: [] 
  }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'worker'], required: true },
  clinic: { type: String },
  profilePic: { type: String },
  settings: { 
    type: settingsSchema, 
    default: () => ({}) 
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
