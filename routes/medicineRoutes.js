const express = require('express');
const Medicine = require('../models/Medicine');
const User = require('../models/User');
const mongoose = require('mongoose');

// TransferHistory model (define inline for simplicity)
const transferHistorySchema = new mongoose.Schema({
  medicineName: String,
  quantity: Number,
  fromClinic: String,
  toClinic: String,
  date: { type: Date, default: Date.now }
});
const TransferHistory = mongoose.models.TransferHistory || mongoose.model('TransferHistory', transferHistorySchema);

const router = express.Router();

// Get all medicines (optionally filter by clinic and search by name)
router.get('/', async (req, res) => {
  try {
    const filter = req.query.clinic ? { clinic: req.query.clinic } : {};
    if (req.query.search) {
      filter.name = { $regex: req.query.search, $options: 'i' };
    }
    const medicines = await Medicine.find(filter);
    res.json(medicines);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a new medicine
router.post('/', async (req, res) => {
  try {
    const { name, description, quantity, purchasePrice, clinic, expiryDate } = req.body;
    const medicine = new Medicine({ name, description, quantity, purchasePrice, clinic, expiryDate });
    await medicine.save();
    res.status(201).json(medicine);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update a medicine
router.put('/:id', async (req, res) => {
  try {
    const medicine = await Medicine.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true }
    );
    if (!medicine) return res.status(404).json({ message: 'Medicine not found' });
    res.json(medicine);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a medicine
router.delete('/:id', async (req, res) => {
  try {
    const medicine = await Medicine.findByIdAndDelete(req.params.id);
    if (!medicine) return res.status(404).json({ message: 'Medicine not found' });
    res.json({ message: 'Medicine deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all unique clinics from medicines and users, with worker names
router.get('/clinics', async (req, res) => {
  try {
    const medicineClinics = await Medicine.distinct('clinic');
    const users = await User.find({ role: 'worker', clinic: { $ne: null } }, 'clinic name');
    // Map: { clinicName: [worker1, worker2, ...] }
    const clinicWorkers = {};
    users.forEach(u => {
      if (!clinicWorkers[u.clinic]) clinicWorkers[u.clinic] = [];
      clinicWorkers[u.clinic].push(u.name);
    });
    // Build clinics array with worker names in brackets
    const allClinics = Array.from(new Set([...medicineClinics, ...users.map(u => u.clinic)].filter(Boolean)));
    const clinicsWithWorkers = allClinics.map(clinic => {
      const workers = clinicWorkers[clinic];
      return workers && workers.length > 0 ? `${clinic} (${workers.join(', ')})` : clinic;
    });
    res.json(clinicsWithWorkers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Atomic transfer of medicine between clinics
router.post('/transfer', async (req, res) => {
  /*
    Body: {
      fromClinic: String,
      toClinic: String,
      medicineId: String, // _id of medicine in fromClinic
      medicineName: String, // for upsert in toClinic
      quantity: Number
    }
  */
  const { fromClinic, toClinic, medicineId, medicineName, quantity } = req.body;
  // Always use only the clinic name (before any ' (') for both fromClinic and toClinic
  const fromClinicName = fromClinic.split(' (')[0];
  const toClinicName = toClinic.split(' (')[0];
  if (!fromClinicName || !toClinicName || !medicineId || !medicineName || !quantity || quantity <= 0) {
    return res.status(400).json({ message: 'Invalid transfer data' });
  }
  if (fromClinicName === toClinicName) {
    return res.status(400).json({ message: 'Cannot transfer to the same clinic' });
  }
  const session = await Medicine.startSession();
  session.startTransaction();
  try {
    // 1. Decrement from source clinic
    const fromMed = await Medicine.findOne({ _id: medicineId, clinic: fromClinicName }).session(session);
    if (!fromMed) throw new Error('Source medicine not found');
    if (fromMed.quantity < quantity) throw new Error('Not enough quantity in source clinic');
    fromMed.quantity -= quantity;
    await fromMed.save({ session });

    // 2. Increment or create in destination clinic (by name+clinic)
    let toMed = await Medicine.findOne({ name: medicineName, clinic: toClinicName }).session(session);
    if (toMed) {
      toMed.quantity += quantity;
      await toMed.save({ session });
    } else {
      // Copy fields from source, but set clinic and quantity
      toMed = new Medicine({
        name: fromMed.name,
        description: fromMed.description,
        quantity: quantity,
        purchasePrice: fromMed.purchasePrice,
        clinic: toClinicName,
        expiryDate: fromMed.expiryDate
      });
      await toMed.save({ session });
    }
    // Save transfer record
    await TransferHistory.create([{
      medicineName: fromMed.name,
      quantity,
      fromClinic: fromClinicName,
      toClinic: toClinicName,
      date: new Date()
    }], { session });
    await session.commitTransaction();
    session.endSession();
    res.json({ message: 'Transfer successful' });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ message: err.message || 'Transfer failed' });
  }
});

// Transfer history endpoint
router.get('/transfer/history', async (req, res) => {
  // Query param: clinic (show all transfers where this clinic was sender or receiver)
  const clinic = req.query.clinic ? req.query.clinic.split(' (')[0] : null;
  if (!clinic) return res.json([]);
  try {
    const history = await TransferHistory.find({
      $or: [
        { fromClinic: clinic },
        { toClinic: clinic }
      ]
    }).sort({ date: -1 });
    res.json(history);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch transfer history' });
  }
});

// Update a transfer history record
router.put('/transfer/history/:id', async (req, res) => {
  try {
    const { medicineName, quantity, fromClinic, toClinic, date } = req.body;
    const updated = await TransferHistory.findByIdAndUpdate(
      req.params.id,
      { medicineName, quantity, fromClinic, toClinic, date },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Transfer record not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Failed to update transfer record' });
  }
});

// Delete a transfer history record
router.delete('/transfer/history/:id', async (req, res) => {
  try {
    const deleted = await TransferHistory.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Transfer record not found' });
    res.json({ message: 'Transfer record deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Failed to delete transfer record' });
  }
});

module.exports = router;
