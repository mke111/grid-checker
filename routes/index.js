const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  try {
    const onDutyCount = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as cnt FROM staff WHERE status = "on_duty"', (err, row) => {
        if (err) reject(err); else resolve(row.cnt);
      });
    });

    const filledCount = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as cnt FROM daily_records WHERE date = ? AND filled = 1',
        [today], (err, row) => { if (err) reject(err); else resolve(row.cnt); }
      );
    });

    const unfilledCount = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as cnt FROM daily_records WHERE date = ? AND filled = 0',
        [today], (err, row) => { if (err) reject(err); else resolve(row.cnt); }
      );
    });

    // 逾期：在岗但今日无记录
    const overdueCount = await new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as cnt FROM staff
         WHERE status = "on_duty"
         AND id NOT IN (SELECT staff_id FROM daily_records WHERE date = ?)`,
        [today], (err, row) => { if (err) reject(err); else resolve(row.cnt); }
      );
    });

    res.render('index', {
      today,
      onDutyCount,
      filledCount,
      unfilledCount,
      overdueCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
