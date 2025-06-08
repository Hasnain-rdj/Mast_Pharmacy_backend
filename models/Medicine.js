const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  quantity: { type: Number, required: true, min: 0 },
  purchasePrice: { type: Number, required: true, min: 0 }, // Only store purchase price, selling price set by workers
  clinic: { type: String, required: true }, // For multi-clinic support
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

medicineSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Medicine', medicineSchema);
