const express = require('express');
const Medicine = require('../models/Medicine');
const User = require('../models/User');
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
    const { name, description, quantity, price, clinic } = req.body;
    const medicine = new Medicine({ name, description, quantity, price, clinic });
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

module.exports = router;
