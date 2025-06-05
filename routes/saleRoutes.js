const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Medicine = require('../models/Medicine');

const SaleSchema = new mongoose.Schema({
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  medicineName: String,
  clinic: String,
  quantity: { type: Number, required: true },
  rate: { type: Number, required: true },
  total: { type: Number, required: true },
  soldBy: { type: String, required: true }, // user email or id
  soldByName: String,
  soldAt: { type: Date, default: Date.now },
});

const Sale = mongoose.model('Sale', SaleSchema);

// Record a sale
router.post('/', async (req, res) => {
  try {
    const { medicineId, medicineName, clinic, quantity, rate, soldBy, soldByName } = req.body;
    const medicine = await Medicine.findById(medicineId);
    if (!medicine) return res.status(404).json({ message: 'Medicine not found' });
    if (medicine.quantity < quantity) return res.status(400).json({ message: 'Not enough stock' });
    medicine.quantity -= quantity;
    await medicine.save();
    const sale = new Sale({
      medicine: medicineId,
      medicineName,
      clinic,
      quantity,
      rate,
      total: quantity * rate,
      soldBy,
      soldByName,
    });
    await sale.save();
    res.status(201).json(sale);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get today's sales for a clinic
router.get('/today', async (req, res) => {
  try {
    const { clinic } = req.query;
    const start = new Date();
    start.setHours(0,0,0,0);
    const end = new Date();
    end.setHours(23,59,59,999);
    const sales = await Sale.find({
      clinic,
      soldAt: { $gte: start, $lte: end }
    }).sort({ soldAt: -1 });
    res.json(sales);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get sales stats for a user
router.get('/stats', async (req, res) => {
  try {
    const { soldBy } = req.query;
    const sales = await Sale.find({ soldBy });
    const totalSold = sales.reduce((sum, s) => sum + s.quantity, 0);
    const totalEarned = sales.reduce((sum, s) => sum + s.total, 0);
    res.json({ totalSold, totalEarned });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get analytics for a clinic (top medicines, total sales, revenue, filter by date)
router.get('/analytics', async (req, res) => {
  try {
    const { clinic, from, to } = req.query;
    const filter = { clinic };
    if (from) filter.soldAt = { ...filter.soldAt, $gte: new Date(from) };
    if (to) filter.soldAt = { ...filter.soldAt, $lte: new Date(to + 'T23:59:59.999Z') };
    const sales = await Sale.find(filter);
    const totalSales = sales.reduce((sum, s) => sum + s.quantity, 0);
    const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
    // Top medicines by quantity sold
    const medMap = {};
    sales.forEach(s => {
      if (!medMap[s.medicineName]) medMap[s.medicineName] = { name: s.medicineName, quantity: 0, revenue: 0 };
      medMap[s.medicineName].quantity += s.quantity;
      medMap[s.medicineName].revenue += s.total;
    });
    const topMedicines = Object.values(medMap).sort((a, b) => b.quantity - a.quantity).slice(0, 10);
    res.json({ totalSales, totalRevenue, topMedicines });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get sales for a clinic by date (YYYY-MM-DD)
router.get('/by-date', async (req, res) => {
  try {
    const { clinic, date } = req.query;
    if (!clinic || !date) return res.status(400).json({ message: 'Clinic and date are required' });
    const start = new Date(date);
    start.setHours(0,0,0,0);
    const end = new Date(date);
    end.setHours(23,59,59,999);
    const sales = await Sale.find({
      clinic,
      soldAt: { $gte: start, $lte: end }
    }).sort({ soldAt: -1 });
    res.json(sales);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get sales for a clinic by month (YYYY-MM)
router.get('/by-month', async (req, res) => {
  try {
    const { clinic, month } = req.query; // month: '2025-06'
    if (!clinic || !month) return res.status(400).json({ message: 'Clinic and month are required' });
    const [year, mon] = month.split('-');
    const start = new Date(year, mon - 1, 1);
    const end = new Date(year, mon, 0, 23, 59, 59, 999);
    const sales = await Sale.find({
      clinic,
      soldAt: { $gte: start, $lte: end }
    }).sort({ soldAt: -1 });
    res.json(sales);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get monthly analytics for a clinic
router.get('/monthly-analytics', async (req, res) => {
  try {
    const { clinic, month } = req.query;
    if (!clinic || !month) return res.status(400).json({ message: 'Clinic and month are required' });
    const [year, mon] = month.split('-');
    const start = new Date(year, mon - 1, 1);
    const end = new Date(year, mon, 0, 23, 59, 59, 999);
    const sales = await Sale.find({
      clinic,
      soldAt: { $gte: start, $lte: end }
    });
    const totalSales = sales.reduce((sum, s) => sum + s.quantity, 0);
    const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
    const medMap = {};
    sales.forEach(s => {
      if (!medMap[s.medicineName]) medMap[s.medicineName] = { name: s.medicineName, quantity: 0, revenue: 0 };
      medMap[s.medicineName].quantity += s.quantity;
      medMap[s.medicineName].revenue += s.total;
    });
    const topMedicines = Object.values(medMap).sort((a, b) => b.quantity - a.quantity).slice(0, 10);
    res.json({ totalSales, totalRevenue, topMedicines });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete a sale by ID (and restore medicine quantity)
router.delete('/:id', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    // Restore medicine quantity
    const medicine = await Medicine.findById(sale.medicine);
    if (medicine) {
      medicine.quantity += sale.quantity;
      await medicine.save();
    }
    await Sale.findByIdAndDelete(req.params.id);
    res.json({ message: 'Sale deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update a sale by ID (allow changing medicine, quantity, rate, etc.)
router.put('/:id', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    const { medicineId, medicineName, quantity, rate, soldAt } = req.body;
    let medicine = await Medicine.findById(sale.medicine);
    // Restore previous quantity
    if (medicine) {
      medicine.quantity += sale.quantity;
      await medicine.save();
    }
    // Update sale fields
    if (medicineId && medicineId !== String(sale.medicine)) {
      // If medicine changed, update reference and adjust new medicine stock
      const newMed = await Medicine.findById(medicineId);
      if (!newMed) return res.status(404).json({ message: 'New medicine not found' });
      newMed.quantity -= quantity;
      await newMed.save();
      sale.medicine = medicineId;
      sale.medicineName = medicineName;
    } else if (medicine) {
      // If same medicine, just adjust stock
      medicine.quantity -= quantity;
      await medicine.save();
    }
    sale.quantity = quantity;
    sale.rate = rate;
    sale.total = quantity * rate;
    if (soldAt) sale.soldAt = soldAt;
    await sale.save();
    res.json(sale);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
